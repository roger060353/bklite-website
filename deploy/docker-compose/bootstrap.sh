#!/bin/bash
set -euo pipefail

#=============================================================================
# 常量定义
#=============================================================================
readonly DEFAULT_MIRROR="bk-lite.tencentcloudcr.com/bklite"
readonly REQUIRED_DOCKER_VERSION="20.10.23"
readonly REQUIRED_COMPOSE_VERSION="2.27.0"
readonly DEFAULT_PORT=443
readonly CERT_SERVER_DAYS=825
readonly CERT_CA_DAYS=3650
readonly COMMON_ENV_FILE="common.env"
readonly PORT_ENV_FILE="port.env"

#=============================================================================
# 颜色定义
#=============================================================================
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[0;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m'

#=============================================================================
# 保存用户通过环境变量传入的 MIRROR（用于优先级判断）
#=============================================================================
readonly USER_MIRROR="${MIRROR:-}"

#=============================================================================
# 工具函数
#=============================================================================
log() {
    local level="$1"
    local message="$2"
    local color=""
    case "$level" in
        INFO)    color="$BLUE" ;;
        WARNING) color="$YELLOW" ;;
        ERROR)   color="$RED" ;;
        SUCCESS) color="$GREEN" ;;
        *)       color="$NC" ;;
    esac
    echo -e "${color}[$(date +'%Y-%m-%d %H:%M:%S')] [$level] $message${NC}"
}

die() {
    log "ERROR" "$1"
    exit 1
}

generate_password() {
    local length="${1:-32}"
    tr -dc 'a-zA-Z0-9' < /dev/urandom | head -c "$length"
}

version_gte() {
    local ver1="$1" ver2="$2"
    [ "$(printf '%s\n' "$ver2" "$ver1" | sort -V | head -n1)" = "$ver2" ]
}

#=============================================================================
# 环境检查
#=============================================================================
check_docker_version() {
    command -v docker >/dev/null 2>&1 || die "未找到 docker 命令，请安装 Docker"
    
    local docker_version
    docker_version=$(docker --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
    [ -z "$docker_version" ] && die "无法获取 Docker 版本信息"
    
    log "INFO" "当前 Docker 版本: $docker_version"
    
    if version_gte "$docker_version" "$REQUIRED_DOCKER_VERSION"; then
        log "SUCCESS" "Docker 版本满足要求 (>= $REQUIRED_DOCKER_VERSION)"
    else
        die "Docker 版本过低，要求 >= $REQUIRED_DOCKER_VERSION，当前: $docker_version"
    fi
}

check_docker_compose_version() {
    local compose_version="" cmd_type=""
    
    if command -v docker-compose >/dev/null 2>&1; then
        compose_version=$(docker-compose --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
        cmd_type="docker-compose"
        DOCKER_COMPOSE_CMD="docker-compose"
    elif docker compose version >/dev/null 2>&1; then
        compose_version=$(docker compose version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
        cmd_type="docker compose"
        DOCKER_COMPOSE_CMD="docker compose"
    else
        die "未找到 docker-compose 或 docker compose 命令"
    fi
    
    [ -z "$compose_version" ] && die "无法获取 Docker Compose 版本信息"
    
    log "INFO" "当前 Docker Compose 版本: $compose_version (使用 $cmd_type 命令)"
    
    if version_gte "$compose_version" "$REQUIRED_COMPOSE_VERSION"; then
        log "SUCCESS" "Docker Compose 版本满足要求 (>= $REQUIRED_COMPOSE_VERSION)"
    else
        die "Docker Compose 版本过低，要求 >= $REQUIRED_COMPOSE_VERSION，当前: $compose_version"
    fi
}

check_nvidia_gpu() {
    command -v nvidia-smi >/dev/null 2>&1 || return 1
    nvidia-smi >/dev/null 2>&1 || return 1
    local gpu_count
    gpu_count=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | wc -l)
    [ "$gpu_count" -gt 0 ]
}

#=============================================================================
# 配置加载（单一入口）
#=============================================================================
load_mirror_config() {
    if [ -f "$COMMON_ENV_FILE" ]; then
        source "$COMMON_ENV_FILE"
    fi
    
    # 用户环境变量优先级最高
    if [ -n "$USER_MIRROR" ]; then
        MIRROR="$USER_MIRROR"
    fi
    
    # 兜底默认值
    MIRROR="${MIRROR:-$DEFAULT_MIRROR}"
    export MIRROR
}

#=============================================================================
# 镜像前缀处理
#=============================================================================
add_mirror_prefix() {
    local image="$1"
    
    # OFFLINE 模式返回原始镜像名
    if [[ "${OFFLINE:-false}" == "true" ]]; then
        echo "$image"
        return
    fi
    
    if [ -n "${MIRROR:-}" ]; then
        if [[ "$image" == *"/"* ]]; then
            echo "${MIRROR}/${image}"
        else
            echo "${MIRROR}/library/${image}"
        fi
    else
        echo "$image"
    fi
}

#=============================================================================
# Docker 镜像初始化
#=============================================================================
init_docker_images() {
    log "INFO" "初始化镜像变量，当前 MIRROR=${MIRROR:-}"
    
    # 基础设施镜像
    export DOCKER_IMAGE_TRAEFIK=$(add_mirror_prefix "traefik:3.6.2")
    export DOCKER_IMAGE_REDIS=$(add_mirror_prefix "redis:5.0.14")
    export DOCKER_IMAGE_NATS=$(add_mirror_prefix "nats:2.10.25")
    export DOCKER_IMAGE_NATS_CLI=$(add_mirror_prefix "natsio/nats-box:latest")
    
    # 数据库镜像
    export DOCKER_IMAGE_POSTGRES=$(add_mirror_prefix "postgres:15")
    export DOCKER_IMAGE_PGVECTOR=$(add_mirror_prefix "pgvector/pgvector:pg15")
    export DOCKER_IMAGE_FALKORDB=$(add_mirror_prefix "falkordb/falkordb:v4.12.4")
    
    # 监控日志镜像
    export DOCKER_IMAGE_VICTORIA_METRICS=$(add_mirror_prefix "victoriametrics/victoria-metrics:v1.106.1")
    export DOCKER_IMAGE_VICTORIALOGS=$(add_mirror_prefix "victoriametrics/victoria-logs:v1.25.0")
    export DOCKER_IMAGE_VECTOR=$(add_mirror_prefix "timberio/vector:0.48.0-debian")
    
    # 应用镜像
    export DOCKER_IMAGE_SERVER=$(add_mirror_prefix "bklite/server")
    export DOCKER_IMAGE_WEB=$(add_mirror_prefix "bklite/web")
    export DOCKER_IMAGE_STARGAZER=$(add_mirror_prefix "bklite/stargazer")
    export DOCKER_IMAGE_METIS=$(add_mirror_prefix "bklite/metis")
    export DOCKER_IMAGE_MLFLOW=$(add_mirror_prefix "bklite/mlflow")
    
    # 存储镜像
    export DOCKER_IMAGE_MINIO=$(add_mirror_prefix "minio/minio:RELEASE.2024-05-01T01-11-10Z-cpuv1")
    
    # 采集器镜像
    export DOCKER_IMAGE_FUSION_COLLECTOR=$(add_mirror_prefix "bklite/fusion-collector:latest")
    export DOCKER_IMAGE_TELEGRAF=$(add_mirror_prefix "bklite/telegraf:latest")
    export DOCKER_IMAGE_NATS_EXECUTOR=$(add_mirror_prefix "bklite/nats-executor")
    
    # 工具镜像
    export DOCKER_IMAGE_OPENSSL=$(add_mirror_prefix "alpine/openssl:3.5.4")
    export DOCKER_IMAGE_VLLM=$(add_mirror_prefix "bklite/vllm:latest")
    export DOCKER_IMAGE_WEBHOOKD=$(add_mirror_prefix "bklite/webhookd:latest")
    
    # 固定配置
    export DOCKER_NETWORK=prod
    export DIST_ARCH=amd64
    export POSTGRES_USERNAME=postgres
    export TRAEFIK_ENABLE_DASHBOARD=false
    export DEFAULT_REQUEST_TIMEOUT=10
    
    log "INFO" "Docker 镜像环境变量初始化完成"
}

#=============================================================================
# 镜像加载（带 hash 校验）
#=============================================================================
load_docker_images_with_hash_check() {
    local images_dir="$1"
    local hash_file="${images_dir}/images.sha256"
    
    [ -d "$images_dir" ] || die "镜像目录不存在: $images_dir"
    [ -f "$hash_file" ] || die "镜像 hash 文件不存在: $hash_file\n请先运行 'bootstrap.sh package' 生成镜像包"
    
    local loaded_count=0 skipped_count=0 total_count=0
    
    log "INFO" "检查本地镜像状态..."
    while IFS= read -r line; do
        [[ -z "$line" || "$line" == \#* ]] && continue
        
        local image_name image_hash image_file
        image_name=$(echo "$line" | awk '{print $1}')
        image_hash=$(echo "$line" | awk '{print $2}')
        image_file=$(echo "$line" | awk '{print $3}')
        total_count=$((total_count + 1))
        
        # 检查镜像是否存在且 hash 匹配
        if docker image inspect "$image_name" >/dev/null 2>&1; then
            local local_hash
            local_hash=$(docker image inspect "$image_name" --format '{{.Id}}' 2>/dev/null | sed 's/sha256://')
            if [ "$local_hash" == "$image_hash" ]; then
                log "SUCCESS" "镜像已存在且 hash 匹配，跳过: $image_name"
                skipped_count=$((skipped_count + 1))
                continue
            fi
            log "WARNING" "镜像存在但 hash 不匹配，需要更新: $image_name"
        else
            log "INFO" "镜像不存在，需要加载: $image_name"
        fi
        
        local image_tar="${images_dir}/${image_file}"
        [ -f "$image_tar" ] || die "镜像文件不存在: $image_tar"
        
        log "INFO" "正在加载镜像文件: $image_file"
        docker load -i "$image_tar"
        loaded_count=$((loaded_count + 1))
        log "SUCCESS" "镜像加载完成: $image_name"
    done < "$hash_file"
    
    log "SUCCESS" "镜像检查完成 - 总计: $total_count, 已加载: $loaded_count, 已跳过: $skipped_count"
}

#=============================================================================
# 容器健康检查
#=============================================================================
wait_container_health() {
    local container_name="$1"
    local service_name="$2"
    
    log "INFO" "等待 $service_name 启动..."
    until [ "$($DOCKER_COMPOSE_CMD ps "$container_name" --format "{{.Health}}" 2>/dev/null)" == "healthy" ]; do
        sleep 5
    done
    log "SUCCESS" "$service_name 已成功启动"
}

#=============================================================================
# 端口配置
#=============================================================================
generate_ports_env() {
    if [ -f "$PORT_ENV_FILE" ]; then
        log "SUCCESS" "$PORT_ENV_FILE 文件已存在，跳过生成..."
        source "$PORT_ENV_FILE"
        return
    fi
    
    local default_ip="127.0.0.1"
    if command -v hostname >/dev/null 2>&1 && hostname -I >/dev/null 2>&1; then
        default_ip=$(hostname -I | awk '{print $1}')
    elif command -v ifconfig >/dev/null 2>&1; then
        default_ip=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -1)
    fi
    
    if [ -n "${HOST_IP:-}" ] && [ -n "${TRAEFIK_WEB_PORT:-}" ]; then
        log "INFO" "使用环境变量: HOST_IP=$HOST_IP, TRAEFIK_WEB_PORT=$TRAEFIK_WEB_PORT"
    elif [ -t 0 ] && [ -e /dev/tty ]; then
        read -p "输入对外访问的IP地址，默认为 [$default_ip] " HOST_IP < /dev/tty
        export HOST_IP=${HOST_IP:-$default_ip}
        
        read -p "输入访问端口，默认为 [$DEFAULT_PORT] " TRAEFIK_WEB_PORT < /dev/tty
        export TRAEFIK_WEB_PORT=${TRAEFIK_WEB_PORT:-$DEFAULT_PORT}
    else
        log "INFO" "非交互模式，使用默认值: HOST_IP=$default_ip, TRAEFIK_WEB_PORT=$DEFAULT_PORT"
        export HOST_IP="$default_ip"
        export TRAEFIK_WEB_PORT="$DEFAULT_PORT"
    fi
    
    cat > "$PORT_ENV_FILE" <<EOF
export HOST_IP=${HOST_IP}
export TRAEFIK_WEB_PORT=${TRAEFIK_WEB_PORT}
EOF
}

#=============================================================================
# TLS 证书生成
#=============================================================================
generate_tls_certs() {
    : "${HOST_IP:?HOST_IP 未设置}"
    
    local dir=./conf/certs
    local traefik_certs_dir=./conf/traefik/certs
    local san="DNS:nats,DNS:localhost,IP:127.0.0.1,IP:${HOST_IP}"
    local cn="BluekingLite"
    local openssl_image="$DOCKER_IMAGE_OPENSSL"
    
    # 证书已存在则跳过
    if [ -f "$dir/server.crt" ] && [ -f "$dir/server.key" ] && [ -f "$dir/ca.crt" ]; then
        log "SUCCESS" "TLS 证书已存在，跳过生成步骤..."
        ensure_traefik_certs "$dir" "$traefik_certs_dir"
        return
    fi
    
    log "INFO" "生成自签名 TLS 证书（使用容器：${openssl_image}）..."
    mkdir -p "$dir"
    
    local abs_dir
    abs_dir=$(cd "$dir" && pwd)
    
    # CA 私钥
    log "INFO" "生成 CA 私钥..."
    docker run --rm -v "${abs_dir}:/certs" "${openssl_image}" \
        genrsa -out "/certs/ca.key" 2048
    
    # CA 证书
    log "INFO" "生成 CA 证书..."
    docker run --rm -v "${abs_dir}:/certs" "${openssl_image}" \
        req -x509 -new -nodes -key "/certs/ca.key" -sha256 -days "$CERT_CA_DAYS" \
        -subj "/CN=Blueking Lite" -out "/certs/ca.crt"
    
    # Server 私钥
    log "INFO" "生成服务器私钥..."
    docker run --rm -v "${abs_dir}:/certs" "${openssl_image}" \
        genrsa -out "/certs/server.key" 2048
    
    # OpenSSL 配置
    cat > "${dir}/openssl.conf" <<EOF
[req]
distinguished_name = req
req_extensions = req_ext
prompt = no

[req_ext]
subjectAltName = ${san}

[v3_ext]
subjectAltName = ${san}
basicConstraints = CA:FALSE
keyUsage = digitalSignature,keyEncipherment,keyAgreement
extendedKeyUsage = serverAuth
EOF
    
    # CSR
    log "INFO" "生成证书签名请求..."
    docker run --rm -v "${abs_dir}:/certs" "${openssl_image}" \
        req -new -key "/certs/server.key" -out "/certs/server.csr" \
        -config "/certs/openssl.conf" -subj "/CN=${cn}"
    
    # 签名
    log "INFO" "签名生成服务器证书..."
    docker run --rm -v "${abs_dir}:/certs" "${openssl_image}" \
        x509 -req -in "/certs/server.csr" -CA "/certs/ca.crt" -CAkey "/certs/ca.key" \
        -CAcreateserial -days "$CERT_SERVER_DAYS" -sha256 -out "/certs/server.crt" \
        -extensions v3_ext -extfile "/certs/openssl.conf"
    
    rm -f "${dir}/server.csr" "${dir}/openssl.conf"
    log "SUCCESS" "TLS 证书生成完成"
    
    ensure_traefik_certs "$dir" "$traefik_certs_dir"
}

ensure_traefik_certs() {
    local src_dir="$1"
    local dst_dir="$2"
    
    if [ -f "$dst_dir/server.crt" ]; then
        log "INFO" "Traefik 证书目录已存在证书，跳过复制..."
        return
    fi
    
    log "INFO" "复制证书到 Traefik 目录..."
    mkdir -p "$dst_dir"
    cp "${src_dir}/server.crt" "${src_dir}/server.key" "$dst_dir/"
}

#=============================================================================
# 通用环境变量生成
#=============================================================================
generate_common_env() {
    if [ -f "$COMMON_ENV_FILE" ]; then
        log "SUCCESS" "发现 $COMMON_ENV_FILE 配置文件，加载已保存的环境变量..."
        source "$COMMON_ENV_FILE"
        load_mirror_config
        ensure_common_env_vars
        return
    fi
    
    log "INFO" "未发现 $COMMON_ENV_FILE 配置文件，生成随机环境变量..."
    
    export POSTGRES_PASSWORD=$(generate_password 32)
    export REDIS_PASSWORD=$(generate_password 32)
    export SECRET_KEY=$(generate_password 32)
    export NEXTAUTH_SECRET=$(generate_password 12)
    export NATS_ADMIN_USERNAME=admin
    export NATS_ADMIN_PASSWORD=$(generate_password 32)
    export NATS_MONITOR_USERNAME=monitor
    export NATS_MONITOR_PASSWORD=$(generate_password 32)
    export MINIO_ROOT_USER=minio
    export MINIO_ROOT_PASSWORD=$(generate_password 32)
    export FALKORDB_PASSWORD=$(generate_password 32)
    
    load_mirror_config
    
    export OFFLINE="${OFFLINE:-false}"
    export OFFLINE_IMAGES_PATH="${OFFLINE_IMAGES_PATH:-./images}"
    export OPSPILOT_ENABLED="${OPSPILOT_ENABLED:-false}"
    export VLLM_ENABLED="${VLLM_ENABLED:-false}"
    export VLLM_BCE_EMBEDDING_MODEL_NAME="maidalun/bce-embedding-base_v1"
    export VLLM_OLMOCR_MODEL_NAME="allenai/OlmOCR-7B-0725"
    export VLLM_BCE_RERANK_MODEL_NAME="maidalun/bce-reranker-base_v1"
    export VLLM_BGE_EMBEDDING_MODEL_NAME="AI-ModelScope/bge-large-zh-v1.5"
    
    save_common_env
    log "SUCCESS" "环境变量已生成并保存到 $COMMON_ENV_FILE"
}

ensure_common_env_vars() {
    local vars_to_check=(
        "OPSPILOT_ENABLED:false"
        "VLLM_ENABLED:false"
        "OFFLINE:false"
        "OFFLINE_IMAGES_PATH:./images"
        "VLLM_BCE_EMBEDDING_MODEL_NAME:maidalun/bce-embedding-base_v1"
        "VLLM_OLMOCR_MODEL_NAME:allenai/OlmOCR-7B-0725"
        "VLLM_BCE_RERANK_MODEL_NAME:maidalun/bce-reranker-base_v1"
        "VLLM_BGE_EMBEDDING_MODEL_NAME:AI-ModelScope/bge-large-zh-v1.5"
    )
    
    for item in "${vars_to_check[@]}"; do
        local var_name="${item%%:*}"
        local default_value="${item#*:}"
        
        if [ -z "${!var_name:-}" ]; then
            export "$var_name"="$default_value"
        fi
        
        if ! grep -q "^export $var_name=" "$COMMON_ENV_FILE"; then
            log "INFO" "将缺失的环境变量 $var_name 添加到 $COMMON_ENV_FILE"
            echo "export $var_name=${!var_name}" >> "$COMMON_ENV_FILE"
        fi
    done
}

save_common_env() {
    cat > "$COMMON_ENV_FILE" <<EOF
# 自动生成的环境变量配置
# 生成日期: $(date +'%Y-%m-%d %H:%M:%S')
export POSTGRES_PASSWORD=$POSTGRES_PASSWORD
export REDIS_PASSWORD=$REDIS_PASSWORD
export SECRET_KEY=$SECRET_KEY
export NEXTAUTH_SECRET=$NEXTAUTH_SECRET
export NATS_ADMIN_USERNAME=$NATS_ADMIN_USERNAME
export NATS_ADMIN_PASSWORD=$NATS_ADMIN_PASSWORD
export NATS_MONITOR_USERNAME=$NATS_MONITOR_USERNAME
export NATS_MONITOR_PASSWORD=$NATS_MONITOR_PASSWORD
export MINIO_ROOT_USER=$MINIO_ROOT_USER
export MINIO_ROOT_PASSWORD=$MINIO_ROOT_PASSWORD
export FALKORDB_PASSWORD=$FALKORDB_PASSWORD
export MIRROR=$MIRROR
export OFFLINE=$OFFLINE
export OFFLINE_IMAGES_PATH=$OFFLINE_IMAGES_PATH
export OPSPILOT_ENABLED=$OPSPILOT_ENABLED
export VLLM_ENABLED=$VLLM_ENABLED
export VLLM_BCE_EMBEDDING_MODEL_NAME=$VLLM_BCE_EMBEDDING_MODEL_NAME
export VLLM_OLMOCR_MODEL_NAME=$VLLM_OLMOCR_MODEL_NAME
export VLLM_BCE_RERANK_MODEL_NAME=$VLLM_BCE_RERANK_MODEL_NAME
export VLLM_BGE_EMBEDDING_MODEL_NAME=$VLLM_BGE_EMBEDDING_MODEL_NAME
EOF
}

#=============================================================================
# 采集器包生成
#=============================================================================
generate_collector_packages() {
    local collector_image="${1:-${DOCKER_IMAGE_FUSION_COLLECTOR}}"
    local output_dir="${2:-./pkgs}"
    local certs_dir="${3:-./conf/certs}"
    local bin_dir="${4:-./bin}"
    
    log "INFO" "开始生成控制器和采集器包..."
    log "INFO" "使用镜像: ${collector_image}"
    
    if [[ "${OFFLINE:-false}" != "true" ]]; then
        docker pull "${collector_image}"
    else
        log "INFO" "检测到 OFFLINE=true，跳过拉取镜像步骤"
    fi
    
    local cpu_arch
    cpu_arch=$(uname -m)
    log "INFO" "检测到CPU架构: ${cpu_arch}"
    
    case "${cpu_arch}" in
        x86_64)
            generate_x86_packages "$collector_image" "$output_dir" "$certs_dir" "$bin_dir"
            ;;
        aarch64)
            log "WARNING" "当前CPU架构为arm64，暂时无内置采集器"
            ;;
        *)
            die "不支持的CPU架构: ${cpu_arch}"
            ;;
    esac
}

generate_x86_packages() {
    local collector_image="$1"
    local output_dir="$2"
    local certs_dir="$3"
    local bin_dir="$4"
    
    log "INFO" "当前CPU架构为x86_64，生成控制器和采集器包..."
    
    [ -d "${output_dir}" ] && rm -rf "${output_dir}"
    mkdir -p "${output_dir}/controller/"{linux,windows}/certs
    mkdir -p "${output_dir}/collector/"{linux,windows}
    
    [ -f "${certs_dir}/ca.crt" ] || die "CA证书文件不存在: ${certs_dir}/ca.crt"
    cp -a "${certs_dir}/ca.crt" "${output_dir}/controller/linux/certs/"
    cp -a "${certs_dir}/ca.crt" "${output_dir}/controller/windows/certs/"
    
    local docker_args=(
        --rm
        -v "${PWD}/${output_dir}:/pkgs"
        -v "${PWD}/${bin_dir}:/tmp/bin"
        --entrypoint=/bin/bash
        "${collector_image}"
    )
    
    docker run -i "${docker_args[@]}" -s <<'COLLECTOR_SCRIPT'
set -e

log() {
    local level="$1" message="$2"
    echo "[Package] [$level] $message"
}

OPT="/opt"
PKG="/pkgs"
STAGE_L="${OPT}/fusion-collectors"
STAGE_W="${OPT}/windows/fusion-collectors"

log "INFO" "Starting Build Process..."

# 导出二进制文件
log "INFO" "Exporting binaries..."
cp -a bin/* "${PKG}/collector/linux/"
cp -a bin/* /tmp/bin/ 2>/dev/null || log "WARNING" "Failed to update /tmp/bin. Skipping."
cp -a "${OPT}/release/windows/fusion-collectors/bin/"* "${PKG}/collector/windows/"

# 构建 Linux 包
log "INFO" "Building Linux package..."
cp -a "${STAGE_L}/misc/linux/"* "${STAGE_L}/"
# 保留原始 VERSION 文件供 init_plugins 使用
cp "${STAGE_L}/misc/VERSION" "${PKG}/controller/"
# 从 VERSION 文件提取版本号（仅数值，不带变量名）写入包内
source "${STAGE_L}/misc/VERSION"
echo "${LINUX_SIDECAR_VERSION}" > "${STAGE_L}/VERSION"
mkdir -p "${STAGE_L}/certs"
cp "${PKG}/controller/linux/certs/ca.crt" "${STAGE_L}/certs/"
rm -rf "${STAGE_L}/misc"
(cd "${OPT}" && zip -rq "${PKG}/controller/fusion-collectors-linux-amd64.zip" fusion-collectors)
log "SUCCESS" "Linux package built."

# 构建 Windows 包
log "INFO" "Building Windows package..."
mkdir -p "$(dirname ${STAGE_W})"
cp -a "${OPT}/release/windows/"* "$(dirname ${STAGE_W})/"
mkdir -p "${STAGE_W}/certs"
cp "${PKG}/controller/windows/certs/ca.crt" "${STAGE_W}/certs/"
# 写入纯版本号
echo "${WINDOWS_SIDECAR_VERSION}" > "${STAGE_W}/VERSION"
rm -rf "${STAGE_W}/misc"
cp ${STAGE_W}/collector-sidecar-installer.exe "${PKG}/controller/windows/"
(cd "${OPT}/windows" && zip -rq "${PKG}/controller/fusion-collectors-windows-amd64.zip" fusion-collectors)
log "SUCCESS" "Windows package built."

log "SUCCESS" "All tasks completed."
COLLECTOR_SCRIPT
    
    log "SUCCESS" "控制器和采集器包生成成功"
}

#=============================================================================
# NATS 配置生成
#=============================================================================
generate_nats_config() {
    mkdir -p ./conf/nats
    
    if [ -f ./conf/nats/nats.conf ]; then
        log "WARNING" "nats.conf 文件已存在，将被覆盖..."
    fi
    
    cat > ./conf/nats/nats.conf <<EOF
port: 4222
monitor_port: 8222
trace: false
debug: false
logtime: false

tls {
  cert_file: "/etc/nats/certs/server.crt"
  key_file: "/etc/nats/certs/server.key"
  ca_file: "/etc/nats/certs/ca.crt"
}

leafnodes {
    port: 7422
    tls {
        cert_file: "/etc/nats/certs/server.crt"
        key_file: "/etc/nats/certs/server.key"
        ca_file: "/etc/nats/certs/ca.crt"
        verify: true
    }
}

jetstream: enabled
jetstream {
  store_dir=/nats/storage
  domain=bklite
}

server_name=nats-server
authorization {
  default_permissions = {
    publish = []
    subscribe = []
  }
  users = [
    {
      user: "${NATS_ADMIN_USERNAME}"
      password: "${NATS_ADMIN_PASSWORD}"
      permissions: {
        publish = [">"]
        subscribe = [">"]
      }
    },
    {
      user: "${NATS_MONITOR_USERNAME}"
      password: "${NATS_MONITOR_PASSWORD}"
      permissions: {
        publish = ["metrics.>","vector","_INBOX.>"]
        subscribe = []
      }
    }
  ]
}
EOF
}

#=============================================================================
# .env 文件生成
#=============================================================================
generate_dotenv() {
    log "INFO" "生成 .env 文件..."
    
    cat > .env <<EOF
HOST_IP=${HOST_IP}
TRAEFIK_WEB_PORT=${TRAEFIK_WEB_PORT}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
REDIS_PASSWORD=${REDIS_PASSWORD}
SECRET_KEY=${SECRET_KEY}
NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
NATS_ADMIN_USERNAME=${NATS_ADMIN_USERNAME}
NATS_ADMIN_PASSWORD=${NATS_ADMIN_PASSWORD}
NATS_MONITOR_USERNAME=${NATS_MONITOR_USERNAME}
NATS_MONITOR_PASSWORD=${NATS_MONITOR_PASSWORD}
MINIO_ROOT_USER=${MINIO_ROOT_USER}
MINIO_ROOT_PASSWORD=${MINIO_ROOT_PASSWORD}
FALKORDB_PASSWORD=${FALKORDB_PASSWORD}
DOCKER_IMAGE_TRAEFIK=${DOCKER_IMAGE_TRAEFIK}
DOCKER_IMAGE_REDIS=${DOCKER_IMAGE_REDIS}
DOCKER_IMAGE_NATS=${DOCKER_IMAGE_NATS}
DOCKER_IMAGE_NATS_CLI=${DOCKER_IMAGE_NATS_CLI}
DOCKER_IMAGE_VICTORIA_METRICS=${DOCKER_IMAGE_VICTORIA_METRICS}
DOCKER_IMAGE_POSTGRES=${DOCKER_IMAGE_POSTGRES}
DOCKER_IMAGE_SERVER=${DOCKER_IMAGE_SERVER}
DOCKER_IMAGE_WEB=${DOCKER_IMAGE_WEB}
DOCKER_IMAGE_STARGAZER=${DOCKER_IMAGE_STARGAZER}
DOCKER_IMAGE_FUSION_COLLECTOR=${DOCKER_IMAGE_FUSION_COLLECTOR}
DOCKER_IMAGE_MINIO=${DOCKER_IMAGE_MINIO}
DOCKER_IMAGE_METIS=${DOCKER_IMAGE_METIS}
DOCKER_IMAGE_TELEGRAF=${DOCKER_IMAGE_TELEGRAF}
POSTGRES_USERNAME=${POSTGRES_USERNAME}
TRAEFIK_ENABLE_DASHBOARD=${TRAEFIK_ENABLE_DASHBOARD}
DEFAULT_REQUEST_TIMEOUT=${DEFAULT_REQUEST_TIMEOUT}
DIST_ARCH=${DIST_ARCH}
DOCKER_NETWORK=${DOCKER_NETWORK}
DOCKER_IMAGE_VICTORIALOGS=${DOCKER_IMAGE_VICTORIALOGS}
DOCKER_IMAGE_MLFLOW=${DOCKER_IMAGE_MLFLOW}
DOCKER_IMAGE_NATS_EXECUTOR=${DOCKER_IMAGE_NATS_EXECUTOR}
DOCKER_IMAGE_FALKORDB=${DOCKER_IMAGE_FALKORDB}
DOCKER_IMAGE_PGVECTOR=${DOCKER_IMAGE_PGVECTOR}
DOCKER_IMAGE_VECTOR=${DOCKER_IMAGE_VECTOR}
DOCKER_IMAGE_VLLM=${DOCKER_IMAGE_VLLM}
DOCKER_IMAGE_WEBHOOKD=${DOCKER_IMAGE_WEBHOOKD}
VLLM_BCE_EMBEDDING_MODEL_NAME=${VLLM_BCE_EMBEDDING_MODEL_NAME}
VLLM_OLMOCR_MODEL_NAME=${VLLM_OLMOCR_MODEL_NAME}
VLLM_BGE_EMBEDDING_MODEL_NAME=${VLLM_BGE_EMBEDDING_MODEL_NAME}
VLLM_BCE_RERANK_MODEL_NAME=${VLLM_BCE_RERANK_MODEL_NAME}
INSTALL_APPS="${INSTALL_APPS}"
EOF
    
    local nats_tls_ca
    nats_tls_ca=$(cat conf/certs/ca.crt)
    echo "NATS_TLS_CA=\"${nats_tls_ca}\"" >> .env
}

#=============================================================================
# 服务启动
#=============================================================================
start_services() {
    log "INFO" "启动基础服务..."
    ${DOCKER_COMPOSE_CMD} up -d traefik redis nats victoria-metrics falkordb victoria-logs minio mlflow nats-executor vector webhookd
    
    log "INFO" "创建 JetStream..."
    docker run --rm --network=bklite-prod \
        -v "$PWD/conf/certs:/etc/certs:ro" \
        "$DOCKER_IMAGE_NATS_CLI" nats -s tls://nats:4222 \
        --tlsca /etc/certs/ca.crt \
        --user "$NATS_ADMIN_USERNAME" --password "$NATS_ADMIN_PASSWORD" \
        stream add metrics --subjects=metrics.* --storage=file \
        --replicas=1 --retention=limits --discard=old \
        --max-age=20m --max-bytes=104857600 --max-consumers=-1 \
        --max-msg-size=-1 --max-msgs=-1 --max-msgs-per-subject=1000000 \
        --dupe-window=5m --no-allow-rollup --no-deny-delete --no-deny-purge
    
    log "INFO" "重启所有服务..."
    ${DOCKER_COMPOSE_CMD} down server
    ${DOCKER_COMPOSE_CMD} up -d
    sleep 10
}

#=============================================================================
# 插件初始化
#=============================================================================
init_plugins() {
    log "INFO" "开始初始化内置插件..."
    
    $DOCKER_COMPOSE_CMD exec -T server /bin/bash -s <<'PLUGIN_INIT'
source /apps/pkgs/controller/VERSION
python manage.py controller_package_init --pk_version $LINUX_SIDECAR_VERSION --file_path /apps/pkgs/controller/fusion-collectors-linux-amd64.zip
python manage.py collector_package_init --os linux --object Telegraf --pk_version latest --file_path /apps/pkgs/collector/linux/telegraf
python manage.py collector_package_init --os linux --object Vector --pk_version latest --file_path /apps/pkgs/collector/linux/vector
python manage.py collector_package_init --os linux --object Nats-Executor --pk_version latest --file_path /apps/pkgs/collector/linux/nats-executor
python manage.py controller_package_init --os windows --pk_version $WINDOWS_SIDECAR_VERSION --file_path /apps/pkgs/controller/fusion-collectors-windows-amd64.zip
python manage.py collector_package_init --os windows --object Telegraf --pk_version latest --file_path /apps/pkgs/collector/windows/telegraf.exe
python manage.py collector_package_init --os windows --object Nats-Executor --pk_version latest --file_path /apps/pkgs/collector/windows/nats-executor.exe
python manage.py installer_init --file_path /apps/pkgs/controller/windows/collector-sidecar-installer.exe
PLUGIN_INIT
}

#=============================================================================
# Sidecar Token 初始化
#=============================================================================
init_sidecar_token() {
    if [ -n "${SIDECAR_NODE_ID:-}" ]; then
        log "SUCCESS" "检测到 SIDECAR_NODE_ID 环境变量，跳过初始化"
        return
    fi
    
    log "WARNING" "重新初始化 Sidecar Node ID 和 Token..."
    
    local arr=()
    mapfile -t arr < <($DOCKER_COMPOSE_CMD exec -T server /bin/bash -c 'python manage.py node_token_init --ip default' 2>&1 | grep -oP 'node_id: \K[0-9a-f]+|token: \K\S+')
    
    if [ ${#arr[@]} -lt 2 ]; then
        log "ERROR" "无法获取 Sidecar Node ID 和 Token，请检查数据库连接"
        log "ERROR" "可能原因: PostgreSQL 密码不匹配（重部署场景需先执行 docker-compose down -v）"
        return 1
    fi
    
    SIDECAR_NODE_ID="${arr[0]}"
    SIDECAR_INIT_TOKEN="${arr[1]}"
    
    log "SUCCESS" "Sidecar Node ID: $SIDECAR_NODE_ID"
    
    # 更新 common.env
    if ! grep -q "^SIDECAR_INIT_TOKEN=" "$COMMON_ENV_FILE" 2>/dev/null; then
        echo "export SIDECAR_INIT_TOKEN=$SIDECAR_INIT_TOKEN" >> "$COMMON_ENV_FILE"
    else
        sed -i.bak "s/^export SIDECAR_INIT_TOKEN=.*$/export SIDECAR_INIT_TOKEN=\"$SIDECAR_INIT_TOKEN\"/g" "$COMMON_ENV_FILE"
        rm -f "${COMMON_ENV_FILE}.bak"
    fi
    echo "export SIDECAR_NODE_ID=$SIDECAR_NODE_ID" >> "$COMMON_ENV_FILE"
    
    echo "SIDECAR_NODE_ID=$SIDECAR_NODE_ID" >> .env
    echo "SIDECAR_INIT_TOKEN=$SIDECAR_INIT_TOKEN" >> .env
}

#=============================================================================
# 更新 common.env 中的参数
#=============================================================================
update_common_env_flags() {
    [ -f "$COMMON_ENV_FILE" ] || return
    
    for var in OPSPILOT_ENABLED VLLM_ENABLED; do
        if grep -q "^export $var=" "$COMMON_ENV_FILE"; then
            sed -i.bak "s/^export $var=.*/export $var=${!var}/" "$COMMON_ENV_FILE"
            rm -f "${COMMON_ENV_FILE}.bak"
        else
            echo "export $var=${!var}" >> "$COMMON_ENV_FILE"
        fi
    done
    
    log "SUCCESS" "已保存参数配置: OPSPILOT_ENABLED=$OPSPILOT_ENABLED, VLLM_ENABLED=$VLLM_ENABLED"
}

#=============================================================================
# install 命令
#=============================================================================
do_install() {
    OFFLINE="${OFFLINE:-false}"
    local clean_install=false
    
    if [ -f "$COMMON_ENV_FILE" ]; then
        log "SUCCESS" "发现配置文件，加载已保存的配置..."
        source "$COMMON_ENV_FILE"
    fi
    
    load_mirror_config
    
    export OPSPILOT_ENABLED="${OPSPILOT_ENABLED:-false}"
    export VLLM_ENABLED="${VLLM_ENABLED:-false}"
    
    for arg in "$@"; do
        case "$arg" in
            --clean)
                clean_install=true
                log "WARNING" "检测到 --clean 参数，将清理现有数据并重新部署"
                ;;
            --opspilot)
                export OPSPILOT_ENABLED=true
                log "INFO" "命令行指定 --opspilot，启用 OpsPilot"
                ;;
            --vllm)
                if check_nvidia_gpu; then
                    export VLLM_ENABLED=true
                    log "INFO" "启用 vLLM（GPU 可用）"
                else
                    log "ERROR" "未检测到 NVIDIA GPU"
                    export VLLM_ENABLED=false
                fi
                ;;
        esac
    done
    
    if [ "$clean_install" = true ]; then
        log "WARNING" "正在停止并清理现有容器和数据卷..."
        $DOCKER_COMPOSE_CMD down -v 2>/dev/null || true
        rm -f "$COMMON_ENV_FILE" "$PORT_ENV_FILE" .env 2>/dev/null || true
        log "SUCCESS" "清理完成，开始全新部署"
    fi
    
    # 构建安装应用列表
    INSTALL_APPS="system_mgmt,cmdb,monitor,node_mgmt,console_mgmt,alerts,log,mlops,operation_analysis"
    if [[ "$OPSPILOT_ENABLED" == "true" ]]; then
        INSTALL_APPS="${INSTALL_APPS},opspilot"
        log "INFO" "安装应用列表: ${INSTALL_APPS}"
    fi
    
    # 构建 compose 命令
    COMPOSE_CMD="${DOCKER_COMPOSE_CMD} -f compose/infra.yaml -f compose/monitor.yaml -f compose/server.yaml -f compose/web.yaml"
    [[ "$VLLM_ENABLED" == "true" ]] && COMPOSE_CMD="${COMPOSE_CMD} -f compose/vllm.yaml"
    COMPOSE_CMD="${COMPOSE_CMD} -f compose/log.yaml config --no-interpolate"
    
    # 镜像加载模式
    local load_local_images=false
    if [[ "$OFFLINE" == "true" ]]; then
        load_local_images=true
        log "INFO" "检测到 OFFLINE=true，将从本地加载镜像"
    fi
    
    # 生成配置
    generate_ports_env
    generate_common_env
    init_docker_images
    update_common_env_flags
    generate_tls_certs
    
    # 生成 docker-compose.yaml
    log "INFO" "生成 docker-compose.yaml..."
    $COMPOSE_CMD > docker-compose.yaml
    
    # 加载或拉取镜像
    if [[ "$load_local_images" == "true" ]]; then
        load_docker_images_with_hash_check "${OFFLINE_IMAGES_PATH:-./images}"
    else
        log "INFO" "拉取最新镜像..."
        ${DOCKER_COMPOSE_CMD} pull
    fi
    
    # 生成采集器包
    generate_collector_packages || exit 1
    
    # 生成配置文件
    generate_nats_config
    generate_dotenv
    
    # 启动服务
    start_services
    init_plugins
    init_sidecar_token
    
    ${DOCKER_COMPOSE_CMD} up -d fusion-collector
    
    log "SUCCESS" "部署成功，访问 https://$HOST_IP:$TRAEFIK_WEB_PORT"
    log "SUCCESS" "初始用户名: admin, 初始密码: password"
}

#=============================================================================
# package 命令
#=============================================================================
do_package() {
    load_mirror_config
    
    local skip_opspilot=true skip_vllm=true
    
    for arg in "$@"; do
        case "$arg" in
            --opspilot)
                skip_opspilot=false
                log "INFO" "检测到 --opspilot，将下载 OpsPilot 镜像"
                ;;
            --vllm)
                skip_vllm=false
                log "INFO" "检测到 --vllm，将下载 vLLM 镜像"
                ;;
        esac
    done
    
    [[ "$skip_opspilot" == "true" ]] && log "INFO" "跳过 OpsPilot 镜像（使用 --opspilot 下载）"
    [[ "$skip_vllm" == "true" ]] && log "INFO" "跳过 vLLM 镜像（使用 --vllm 下载）"
    
    log "INFO" "开始下载 Docker 镜像..."
    log "INFO" "镜像仓库: ${MIRROR}"
    
    init_docker_images
    
    mkdir -p images
    
    local hash_file="images/images.sha256"
    cat > "$hash_file" <<EOF
# 镜像 hash 文件
# 格式: 镜像名称 镜像hash 文件名
# 生成时间: $(date +'%Y-%m-%d %H:%M:%S')
EOF
    
    local image_count=0 skipped_count=0
    
    for image_var in $(compgen -v | grep '^DOCKER_IMAGE_'); do
        # 跳过 OpsPilot 镜像
        if [[ "$skip_opspilot" == "true" ]] && [[ "$image_var" =~ METIS ]]; then
            log "INFO" "跳过: ${image_var}"
            skipped_count=$((skipped_count + 1))
            continue
        fi
        
        # 跳过 vLLM 镜像
        if [[ "$skip_vllm" == "true" ]] && [[ "$image_var" =~ VLLM ]]; then
            log "INFO" "跳过: ${image_var}"
            skipped_count=$((skipped_count + 1))
            continue
        fi
        
        local image_name="${!image_var}"
        log "INFO" "下载镜像: $image_name"
        docker pull "$image_name"
        
        # 还原镜像名称
        local original_name
        original_name=$(echo "$image_name" | sed "s|${MIRROR}/||;s|/library/|/|")
        docker tag "$image_name" "$original_name"
        
        # 保存镜像
        local safe_filename
        safe_filename=$(echo "$original_name" | sed 's|/|_|g; s|:|_|g').tar
        
        log "INFO" "保存镜像: $safe_filename"
        docker save "$original_name" -o "images/$safe_filename"
        
        # 记录 hash
        local image_hash
        image_hash=$(docker image inspect "$original_name" --format '{{.Id}}' 2>/dev/null | sed 's/sha256://')
        
        if [ -n "$image_hash" ]; then
            echo "$original_name $image_hash $safe_filename" >> "$hash_file"
            log "SUCCESS" "已保存: $original_name"
            image_count=$((image_count + 1))
        fi
    done
    
    log "SUCCESS" "镜像打包完成！总计: $image_count 个"
    [ "$skipped_count" -gt 0 ] && log "INFO" "跳过: $skipped_count 个"
    
    local pkg_name="bklite-offline.tar.gz"
    tar --exclude='*.env' --exclude='conf/certs/' --exclude='conf/nats/nats.conf' --exclude='pkgs/' --exclude='bin/' -czf "/opt/$pkg_name" .
    log "SUCCESS" "已生成离线包: /opt/$pkg_name"
}

#=============================================================================
# 入口
#=============================================================================
main() {
    log "INFO" "开始检查 Docker 和 Docker Compose 版本..."
    check_docker_version
    check_docker_compose_version
    
    case "${1:-}" in
        package)
            shift
            do_package "$@"
            ;;
        *)
            do_install "$@"
            ;;
    esac
}

main "$@"
