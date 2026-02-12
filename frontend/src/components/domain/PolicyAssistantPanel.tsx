/**
 * PolicyAssistantPanel - Smart AI Assistant for the Policy Analysis step
 *
 * Chat-style panel that lets users ask questions about the current case's
 * policy analysis, coverage criteria, documentation gaps, and cohort data.
 * Calls Claude via POST /api/v1/cases/{id}/policy-qa.
 *
 * Features:
 * - TanStack Query useMutation for API calls
 * - Framer Motion animations for messages
 * - Suggested questions that reappear as follow-up chips
 * - Proper ARIA attributes for accessibility
 * - Error handling with retry
 * - Auto-scroll to latest message
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { useMutation } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MessageCircle,
  Send,
  Loader2,
  Sparkles,
  AlertCircle,
  RotateCcw,
} from 'lucide-react'
import Markdown from 'react-markdown'
import { cn } from '@/lib/utils'
import { casesApi } from '@/services/api'

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  error?: boolean
}

interface PolicyAssistantPanelProps {
  caseId: string
  className?: string
  title?: string
  subtitle?: string
  suggestedQuestions?: string[]
  followUpQuestions?: string[]
  emptyStateText?: string
}

/* ------------------------------------------------------------------ */
/* Default suggested questions                                         */
/* ------------------------------------------------------------------ */

const DEFAULT_SUGGESTED_QUESTIONS = [
  'What are the biggest risks for denial?',
  'Which documentation gaps should I address first?',
  'What are the step therapy requirements?',
  'What documentation would strengthen this case?',
]

const DEFAULT_FOLLOW_UP_QUESTIONS = [
  'What documentation is missing?',
  'How can I improve approval odds?',
  'Summarize the coverage criteria.',
]

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function PolicyAssistantPanel({
  caseId,
  className,
  title = 'Case Assistant',
  subtitle = 'Ask about this case',
  suggestedQuestions = DEFAULT_SUGGESTED_QUESTIONS,
  followUpQuestions = DEFAULT_FOLLOW_UP_QUESTIONS,
  emptyStateText = 'Ask questions about the policy analysis, coverage criteria, or documentation gaps.',
}: PolicyAssistantPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  // ---- TanStack Query mutation for the policy Q&A call ----
  const mutation = useMutation({
    mutationFn: (question: string) => casesApi.policyQA(caseId, question),
    onSuccess: (data) => {
      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: data.answer,
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, assistantMsg])
    },
    onError: () => {
      const errorMsg: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: 'Sorry, I was unable to answer that question. Please try again.',
        timestamp: new Date(),
        error: true,
      }
      setMessages(prev => [...prev, errorMsg])
    },
    onSettled: () => {
      // Refocus input after response
      setTimeout(() => inputRef.current?.focus(), 50)
    },
  })

  // ---- Auto-scroll on new messages ----
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, mutation.isPending])

  // ---- Send handler ----
  const handleSend = useCallback((question?: string) => {
    const q = (question || input).trim()
    if (!q || mutation.isPending) return

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: q,
      timestamp: new Date(),
    }
    setMessages(prev => [...prev, userMsg])
    setInput('')

    mutation.mutate(q)
  }, [input, mutation])

  // ---- Retry the last failed question ----
  const handleRetry = useCallback(() => {
    // Find the last user message (the question that failed)
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
    if (!lastUserMsg) return

    // Remove the error message
    setMessages(prev => prev.filter(m => !m.error))

    mutation.mutate(lastUserMsg.content)
  }, [messages, mutation])

  // ---- Keyboard handler ----
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  const hasMessages = messages.length > 0
  const isLoading = mutation.isPending
  const hasError = messages.some(m => m.error)

  return (
    <div
      className={cn(
        'flex flex-col bg-white rounded-2xl border border-grey-200 overflow-hidden',
        !className && 'h-[calc(100vh-220px)] sticky top-[88px]',
        className
      )}
      role="complementary"
      aria-label="Policy Assistant chat panel"
    >
      {/* ---- Header ---- */}
      <div className="px-4 py-3 border-b border-grey-200 bg-grey-50">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-grey-900 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-white" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-grey-900" id="policy-assistant-title">
              {title}
            </h3>
            <p className="text-[10px] text-grey-400">{subtitle}</p>
          </div>
        </div>
      </div>

      {/* ---- Messages Area ---- */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
        role="log"
        aria-label="Chat messages"
        aria-live="polite"
        aria-relevant="additions"
      >
        {!hasMessages ? (
          /* ---- Empty state with suggested questions ---- */
          <div className="flex flex-col items-center justify-center h-full text-center px-2">
            <MessageCircle className="w-8 h-8 text-grey-200 mb-3" aria-hidden="true" />
            <p className="text-xs text-grey-500 mb-4">
              {emptyStateText}
            </p>
            <div className="space-y-1.5 w-full" role="group" aria-label="Suggested questions">
              {suggestedQuestions.map((q, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSend(q)}
                  disabled={isLoading}
                  aria-label={`Ask: ${q}`}
                  className="w-full text-left px-3 py-2 text-xs text-grey-700 bg-grey-50 hover:bg-grey-100 rounded-lg border border-grey-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* ---- Message bubbles ---- */}
            <AnimatePresence initial={false}>
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  className={cn(
                    'flex',
                    msg.role === 'user' ? 'justify-end' : 'justify-start'
                  )}
                  role="article"
                  aria-label={msg.role === 'user' ? 'Your question' : msg.error ? 'Error response' : 'AI response'}
                >
                  <div className={cn(
                    'max-w-[90%] rounded-xl px-3 py-2',
                    msg.role === 'user'
                      ? 'bg-grey-900 text-white'
                      : msg.error
                        ? 'bg-grey-50 border border-grey-200 text-grey-700'
                        : 'bg-grey-50 border border-grey-200 text-grey-800'
                  )}>
                    {/* Assistant label */}
                    {msg.role === 'assistant' && !msg.error && (
                      <div className="flex items-center gap-1 mb-1">
                        <Sparkles className="w-3 h-3 text-grey-400" aria-hidden="true" />
                        <span className="text-[10px] font-medium text-grey-400">AI</span>
                      </div>
                    )}

                    {/* Error label with retry */}
                    {msg.error && (
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1">
                          <AlertCircle className="w-3 h-3 text-grey-500" aria-hidden="true" />
                          <span className="text-[10px] font-medium text-grey-500">Error</span>
                        </div>
                        <button
                          type="button"
                          onClick={handleRetry}
                          disabled={isLoading}
                          className="flex items-center gap-1 text-[10px] font-medium text-grey-600 hover:text-grey-700 transition-colors disabled:opacity-50"
                          aria-label="Retry last question"
                        >
                          <RotateCcw className="w-2.5 h-2.5" aria-hidden="true" />
                          Retry
                        </button>
                      </div>
                    )}

                    {/* Message content */}
                    {msg.role === 'assistant' && !msg.error ? (
                      <div className="prose prose-sm prose-grey max-w-none prose-headings:text-grey-800 prose-headings:font-semibold prose-p:text-grey-700 prose-p:leading-relaxed prose-p:my-1 prose-li:text-grey-700 prose-li:my-0 prose-ul:my-1 prose-ol:my-1 prose-strong:text-grey-900 prose-hr:border-grey-200 text-xs [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                        <Markdown>{msg.content}</Markdown>
                      </div>
                    ) : (
                      <p className="text-xs leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {/* ---- Typing indicator ---- */}
            {isLoading && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15 }}
                className="flex justify-start"
                role="status"
                aria-label="AI is thinking"
              >
                <div className="bg-grey-50 border border-grey-200 rounded-xl px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-3 h-3 text-grey-400 animate-spin" aria-hidden="true" />
                    <span className="text-xs text-grey-400">Thinking...</span>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ---- Follow-up suggestions (shown after conversation starts) ---- */}
            {!isLoading && !hasError && messages.length >= 2 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3, duration: 0.2 }}
                className="pt-1"
              >
                <div
                  className="flex flex-wrap gap-1.5"
                  role="group"
                  aria-label="Follow-up suggestions"
                >
                  {followUpQuestions.map((q, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSend(q)}
                      disabled={isLoading}
                      aria-label={`Ask: ${q}`}
                      className="px-2.5 py-1 text-[10px] text-grey-600 bg-grey-50 hover:bg-grey-100 rounded-full border border-grey-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            <div ref={messagesEndRef} aria-hidden="true" />
          </>
        )}
      </div>

      {/* ---- Input Area ---- */}
      <div className="px-3 py-2.5 border-t border-grey-200 bg-white">
        <form
          onSubmit={(e) => { e.preventDefault(); handleSend() }}
          className="flex items-center gap-2"
          aria-label="Send a question to the Policy Assistant"
        >
          <label htmlFor="policy-assistant-input" className="sr-only">
            Type your question
          </label>
          <input
            id="policy-assistant-input"
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about this case..."
            disabled={isLoading}
            autoComplete="off"
            aria-describedby="policy-assistant-title"
            className="flex-1 text-xs px-3 py-2 border border-grey-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-grey-900/20 disabled:opacity-50 disabled:cursor-not-allowed placeholder:text-grey-400"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            aria-label="Send question"
            className={cn(
              'p-2 rounded-lg transition-colors',
              input.trim() && !isLoading
                ? 'bg-grey-900 text-white hover:bg-grey-800'
                : 'bg-grey-100 text-grey-400 cursor-not-allowed'
            )}
          >
            <Send className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </form>
      </div>
    </div>
  )
}

export default PolicyAssistantPanel
