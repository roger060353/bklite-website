import React, { useState, useRef, useEffect, useCallback } from 'react';

import clsx from 'clsx';
import { FiClock, FiDatabase, FiMessageSquare, FiSend } from 'react-icons/fi';

import PageHeader from '@site/src/components/Playground/PageHeader';

import styles from './styles.module.css';

// 场景配置
const scenarios = {
  'site-check': {
    name: '站点检查',
    desc: '智能网站巡检与交互验证',
    icon: FiClock,
    quickQuestions: [
      '访问 www.bklite.ai，检查所有一级菜单能否正常打开',
      '检查 www.bklite.ai 的首页加载速度和响应时间'
    ],
    mockResponse: '已收到您的请求。我可以帮您检查站点状态、分析性能指标、诊断访问问题等。请问您需要检查哪个站点？'
  },
  'mssql-assistant': {
    name: 'MSSQL 助手',
    desc: '数据库运维智能问答',
    icon: FiDatabase,
    quickQuestions: [
      '查询数据库的连接数和活跃会话',
      '分析最近执行最慢的 TOP 10 查询语句'
    ],
    mockResponse: '已收到您的请求。我可以帮您处理 MSSQL 数据库相关问题，包括查询优化、性能分析、故障诊断等。请描述您遇到的具体问题。'
  }
};

export default function OpsPilotTab() {
  const [selectedScenario, setSelectedScenario] = useState('site-check');
  const [messages, setMessages] = useState({
    'site-check': [],
    'mssql-assistant': []
  });
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  const chatMessagesRef = useRef(null);
  const textareaRef = useRef(null);

  // 自动滚动到底部（仅滚动聊天容器，不影响页面滚动）
  useEffect(() => {
    const container = chatMessagesRef.current;
    if (container && currentMessages.length > 0) {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, isTyping]);

  // 自动调整 textarea 高度
  const handleTextareaInput = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
    }
  }, []);

  // 发送消息
  const sendMessage = useCallback(() => {
    const content = inputValue.trim();
    if (!content || isTyping) return;

    // 添加用户消息
    setMessages(prev => ({
      ...prev,
      [selectedScenario]: [...prev[selectedScenario], { role: 'user', content }]
    }));

    // 清空输入
    setInputValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    // 显示 typing 指示器
    setIsTyping(true);

    // 模拟 AI 响应
    setTimeout(() => {
      setIsTyping(false);
      setMessages(prev => ({
        ...prev,
        [selectedScenario]: [
          ...prev[selectedScenario],
          { role: 'assistant', content: scenarios[selectedScenario].mockResponse }
        ]
      }));
    }, 1000 + Math.random() * 1000);
  }, [inputValue, isTyping, selectedScenario]);

  // 快捷问题点击
  const handleQuickQuestion = useCallback((question) => {
    setInputValue(question);
    // 使用 setTimeout 确保 state 更新后再发送
    setTimeout(() => {
      const content = question.trim();
      if (!content) return;

      setMessages(prev => ({
        ...prev,
        [selectedScenario]: [...prev[selectedScenario], { role: 'user', content }]
      }));
      setInputValue('');
      setIsTyping(true);

      setTimeout(() => {
        setIsTyping(false);
        setMessages(prev => ({
          ...prev,
          [selectedScenario]: [
            ...prev[selectedScenario],
            { role: 'assistant', content: scenarios[selectedScenario].mockResponse }
          ]
        }));
      }, 1000 + Math.random() * 1000);
    }, 0);
  }, [selectedScenario]);

  // Enter 发送
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }, [sendMessage]);

  const currentMessages = messages[selectedScenario] || [];
  const currentScenario = scenarios[selectedScenario];

  return (
    <div className={styles.opsPilotTab}>
      <PageHeader title="OpsPilot AI场景体验" subtitle="选择应用场景，体验 AI 运维能力" />

      <div className={styles.contentWrapper}>
        {/* Sidebar */}
        <aside className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <h2>应用场景</h2>
          </div>
          <div className={styles.scenarioList}>
            {Object.entries(scenarios).map(([key, config]) => {
              const Icon = config.icon;
              return (
                <div
                  key={key}
                  className={clsx(styles.scenarioItem, selectedScenario === key && styles.selected)}
                  onClick={() => setSelectedScenario(key)}
                >
                  <div className={styles.scenarioItemIcon}>
                    <Icon />
                  </div>
                  <div className={styles.scenarioItemInfo}>
                    <div className={styles.scenarioItemName}>{config.name}</div>
                    <div className={styles.scenarioItemDesc}>{config.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* Main Content */}
        <main className={styles.mainContent}>
          <div className={styles.chatCard}>
            {/* Chat Header */}
            <div className={styles.chatHeader}>
              <div className={styles.chatHeaderLeft}>
                <h2>{currentScenario.name}</h2>
                <p>{currentScenario.desc}</p>
              </div>
              <span className={styles.chatHeaderStatus}>
                <FiClock />
                在线
              </span>
            </div>

            {/* Chat Messages */}
            <div className={styles.chatMessages} ref={chatMessagesRef}>
              {currentMessages.length === 0 && !isTyping ? (
                <div className={styles.chatEmpty}>
                  <div className={styles.chatEmptyIcon}>
                    <FiMessageSquare />
                  </div>
                  <h3>开始对话</h3>
                  <p>选择一个问题开始，或输入您的问题</p>
                  <div className={styles.quickQuestions}>
                    {currentScenario.quickQuestions.map((q, idx) => (
                      <button
                        key={idx}
                        className={styles.quickQuestion}
                        onClick={() => handleQuickQuestion(q)}
                      >
                        <span className={styles.quickQuestionIcon}>
                          <FiMessageSquare />
                        </span>
                        <span>{q}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {currentMessages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={clsx(
                        styles.chatMessage,
                        msg.role === 'user' ? styles.chatMessageUser : styles.chatMessageAssistant
                      )}
                    >
                      <div className={styles.chatMessageAvatar}>
                        {msg.role === 'user' ? 'U' : 'AI'}
                      </div>
                      <div className={styles.chatMessageContent}>
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  {isTyping && (
                    <div className={styles.typingIndicator}>
                      <div className={styles.typingIndicatorAvatar}>AI</div>
                      <div className={styles.typingIndicatorDots}>
                        <span className={styles.typingIndicatorDot}></span>
                        <span className={styles.typingIndicatorDot}></span>
                        <span className={styles.typingIndicatorDot}></span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Chat Input */}
            <div className={styles.chatInputWrapper}>
              <div className={styles.chatInput}>
                <div className={styles.chatInputField}>
                  <textarea
                    ref={textareaRef}
                    className={styles.chatInputTextarea}
                    placeholder="输入您的问题..."
                    rows="1"
                    value={inputValue}
                    onChange={(e) => {
                      setInputValue(e.target.value);
                      handleTextareaInput();
                    }}
                    onKeyDown={handleKeyDown}
                  />
                </div>
                <button
                  className={styles.chatInputSend}
                  onClick={sendMessage}
                  disabled={isTyping || !inputValue.trim()}
                >
                  <FiSend />
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
