/**
 * AppealPanel - Appeal management UI for denied or recovery cases
 *
 * Three collapsible sections:
 * 1. Appeal Strategy - AI-generated clinical arguments and evidence
 * 2. Appeal Letter Draft - LLM-drafted letter with edit/copy support
 * 3. Peer-to-Peer Preparation - Checklist for P2P review readiness
 *
 * Uses the same greyscale Apple-inspired design language as
 * CohortInsightsPanel and StrategicIntelligence.
 */

import { useState, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  FileText,
  AlertCircle,
  ChevronDown,
  Copy,
  Check,
  Scale,
  UserCheck,
  ShieldAlert,
  Zap,
  Target,
  BookOpen,
  ClipboardList,
  Pencil,
  RotateCcw,
} from 'lucide-react'
import Markdown from 'react-markdown'
import { cn } from '@/lib/utils'
import { ENDPOINTS, QUERY_KEYS } from '@/lib/constants'
import { AppealPrediction } from '@/components/domain/AppealPrediction'

// ── Types ──

interface AppealPanelProps {
  caseId: string
  caseData: Record<string, unknown>
  denialContext?: {
    payer_name: string
    denial_reason?: string
    coverage_status?: string
    approval_likelihood?: number
  }
  className?: string
}

interface AppealStrategyData {
  primary_clinical_argument: string
  supporting_arguments: string[]
  evidence_to_cite: Array<Record<string, unknown>>
  policy_sections_to_reference: string[]
  medical_literature_citations: string[]
  recommended_appeal_type: 'standard' | 'expedited' | 'peer_to_peer'
  urgency_justification?: string
  peer_to_peer_talking_points?: string[]
  success_probability: number
  success_probability_reasoning: string
  key_risks: string[]
  fallback_strategies: string[]
  denial_classification: string
}

interface StrategyGenerationResponse {
  appeal_strategy?: AppealStrategyData
  strategies?: unknown[]
  [key: string]: unknown
}

// ── API helpers ──

async function generateAppealStrategy(caseId: string): Promise<StrategyGenerationResponse> {
  const { request } = await import('@/services/api')
  return request<StrategyGenerationResponse>(
    ENDPOINTS.generateStrategies(caseId),
    { method: 'POST' },
    120000 // 2 minute timeout for LLM calls
  )
}

async function draftAppealLetter(caseId: string, strategyData?: AppealStrategyData): Promise<string> {
  const { request } = await import('@/services/api')
  const body = strategyData ? { appeal_strategy: strategyData } : {}
  const response = await request<{ letter: string; case_id: string }>(
    ENDPOINTS.draftAppealLetter(caseId),
    { method: 'POST', body: JSON.stringify(body) },
    120000 // 2 minute timeout for LLM drafting
  )
  return response.letter || 'Unable to generate appeal letter.'
}

// ── P2P Checklist items ──

const P2P_CHECKLIST_ITEMS = [
  'Review all clinical documentation and test results',
  'Prepare summary of step therapy history and outcomes',
  'Document clinical rationale for requested medication',
  "Review payer's specific denial reason and policy criteria",
  'Prepare responses to common payer objections',
  "Have patient's latest lab results and imaging available",
]

// ── Main Component ──

export function AppealPanel({ caseId, caseData: _caseData, denialContext, className }: AppealPanelProps) {
  const queryClient = useQueryClient()
  const [appealStrategy, setAppealStrategy] = useState<AppealStrategyData | null>(null)
  const [appealLetter, setAppealLetter] = useState<string>('')
  const [isEditing, setIsEditing] = useState(false)
  const [expandedSection, setExpandedSection] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [p2pChecked, setP2pChecked] = useState<Record<number, boolean>>({})
  const [isRevealingStrategy, setIsRevealingStrategy] = useState(false)
  const [isRevealingLetter, setIsRevealingLetter] = useState(false)

  const strategyCacheKey = `appeal-strategy-${caseId}`
  const letterCacheKey = `appeal-letter-${caseId}`

  // Generate appeal strategy mutation
  const strategyMutation = useMutation({
    mutationFn: () => generateAppealStrategy(caseId),
    onSuccess: (data) => {
      if (data.appeal_strategy) {
        setAppealStrategy(data.appeal_strategy)
        queryClient.setQueryData(QUERY_KEYS.appealStrategy(caseId), data.appeal_strategy)
        try { localStorage.setItem(strategyCacheKey, JSON.stringify(data.appeal_strategy)) } catch { /* quota */ }
        setExpandedSection('strategy')
      }
    },
  })

  // Draft appeal letter mutation — passes strategy data for richer prompt
  const letterMutation = useMutation({
    mutationFn: () => draftAppealLetter(caseId, appealStrategy ?? undefined),
    onSuccess: (letter) => {
      setAppealLetter(letter)
      queryClient.setQueryData(QUERY_KEYS.appealLetter(caseId), letter)
      try { localStorage.setItem(letterCacheKey, letter) } catch { /* quota */ }
      setExpandedSection('letter')
    },
  })

  const isStrategyLoading = isRevealingStrategy || strategyMutation.isPending
  const isLetterLoading = isRevealingLetter || letterMutation.isPending

  const handleGenerateStrategy = () => {
    let cached = queryClient.getQueryData<AppealStrategyData>(QUERY_KEYS.appealStrategy(caseId))
    if (!cached) {
      try {
        const stored = localStorage.getItem(strategyCacheKey)
        if (stored) cached = JSON.parse(stored) as AppealStrategyData
      } catch { /* ignore */ }
    }
    if (cached) {
      const data = cached
      setIsRevealingStrategy(true)
      setTimeout(() => {
        setAppealStrategy(data)
        setIsRevealingStrategy(false)
        setExpandedSection('strategy')
      }, 5500)
    } else {
      strategyMutation.mutate()
    }
  }

  const handleDraftLetter = () => {
    let cached = queryClient.getQueryData<string>(QUERY_KEYS.appealLetter(caseId))
    if (!cached) {
      try {
        const stored = localStorage.getItem(letterCacheKey)
        if (stored) cached = stored
      } catch { /* ignore */ }
    }
    if (cached) {
      const data = cached
      setIsRevealingLetter(true)
      setTimeout(() => {
        setAppealLetter(data)
        setIsRevealingLetter(false)
        setExpandedSection('letter')
      }, 5500)
    } else {
      letterMutation.mutate()
    }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(appealLetter)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback: select the textarea content
    }
  }

  const handleP2pToggle = (idx: number) => {
    setP2pChecked(prev => ({ ...prev, [idx]: !prev[idx] }))
  }

  const wordCount = appealLetter.trim().split(/\s+/).filter(Boolean).length
  const charCount = appealLetter.length

  const appealTypeLabel = (type: string) => {
    switch (type) {
      case 'expedited': return 'Expedited Appeal'
      case 'peer_to_peer': return 'Peer-to-Peer Review'
      default: return 'Standard Appeal'
    }
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-grey-50 rounded-xl border border-grey-200">
        <div className="p-2 rounded-lg bg-grey-900">
          <Scale className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-grey-900">Appeal Management</h3>
          <p className="text-xs text-grey-400 truncate">
            {denialContext?.payer_name ? `${denialContext.payer_name} - ` : ''}
            {denialContext?.denial_reason || 'Review denial and prepare appeal'}
          </p>
        </div>
        {denialContext?.approval_likelihood !== undefined && (
          <div className="text-right shrink-0">
            <p className="text-lg font-semibold text-grey-900">
              {Math.round(denialContext.approval_likelihood)}%
            </p>
            <p className="text-[10px] text-grey-400 uppercase tracking-wide">Likelihood</p>
          </div>
        )}
      </div>

      {/* Section 0: Appeal Success Prediction */}
      <AppealPrediction caseId={caseId} />

      {/* Section 1: Appeal Strategy */}
      <CollapsibleSection
        title="Appeal Strategy"
        icon={<Target className="w-4 h-4" />}
        expanded={expandedSection === 'strategy'}
        onToggle={() => setExpandedSection(expandedSection === 'strategy' ? null : 'strategy')}
      >
        {!appealStrategy && !isStrategyLoading && !strategyMutation.isError ? (
          <div className="text-center py-6">
            <Scale className="w-8 h-8 text-grey-200 mx-auto mb-3" />
            <p className="text-sm text-grey-500 mb-1">Generate an AI-powered appeal strategy</p>
            <p className="text-xs text-grey-400 mb-4">
              Claude will analyze the denial and build clinical arguments
            </p>
            <button
              type="button"
              onClick={handleGenerateStrategy}
              className="inline-flex items-center gap-2 px-4 py-2 bg-grey-900 text-white text-sm font-medium rounded-lg hover:bg-grey-800 transition-colors"
            >
              <Zap className="w-4 h-4" />
              Generate Appeal Strategy
            </button>
          </div>
        ) : isStrategyLoading ? (
          <div className="flex items-center gap-3 px-4 py-6 justify-center">
            <svg className="w-5 h-5 text-grey-400 animate-spin shrink-0" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-20" />
              <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
            <div>
              <p className="text-sm font-medium text-grey-700">Generating appeal strategy...</p>
              <p className="text-xs text-grey-400">Analyzing denial reason and building clinical arguments</p>
            </div>
          </div>
        ) : strategyMutation.isError ? (
          <div className="text-center py-6">
            <AlertCircle className="w-6 h-6 text-grey-300 mx-auto mb-2" />
            <p className="text-sm font-medium text-grey-700 mb-1">
              Failed to generate appeal strategy
            </p>
            <p className="text-xs text-grey-400 mb-3">
              {strategyMutation.error instanceof Error ? strategyMutation.error.message : 'An error occurred'}
            </p>
            <button
              type="button"
              onClick={handleGenerateStrategy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-grey-900 hover:bg-grey-800 rounded-lg transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              Retry
            </button>
          </div>
        ) : appealStrategy ? (
          <div className="space-y-4">
            {/* Appeal type + denial classification badges */}
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs font-medium px-2.5 py-1 rounded-lg bg-grey-900 text-white">
                {appealTypeLabel(appealStrategy.recommended_appeal_type)}
              </span>
              <span className="text-xs font-medium px-2.5 py-1 rounded-lg bg-grey-100 text-grey-500">
                {appealStrategy.denial_classification.replace(/_/g, ' ')}
              </span>
            </div>

            {/* Primary argument */}
            <div className="bg-grey-50 rounded-xl border border-grey-100 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-3.5 h-3.5 text-grey-500" />
                <span className="text-xs font-medium text-grey-400 uppercase tracking-wider">
                  Primary Clinical Argument
                </span>
              </div>
              <p className="text-sm text-grey-800 leading-relaxed">
                {appealStrategy.primary_clinical_argument}
              </p>
            </div>

            {/* Supporting arguments */}
            {appealStrategy.supporting_arguments.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <ClipboardList className="w-3.5 h-3.5 text-grey-500" />
                  <span className="text-xs font-medium text-grey-400 uppercase tracking-wider">
                    Supporting Arguments
                  </span>
                </div>
                <div className="space-y-2">
                  {appealStrategy.supporting_arguments.map((arg, idx) => (
                    <div key={idx} className="flex items-start gap-3 p-3 bg-grey-50 rounded-xl border border-grey-100">
                      <div className={cn(
                        'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0',
                        idx === 0 ? 'bg-grey-900 text-white' : 'bg-grey-200 text-grey-600'
                      )}>
                        {idx + 1}
                      </div>
                      <p className="text-xs text-grey-700 leading-relaxed">{arg}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Evidence to cite */}
            {appealStrategy.evidence_to_cite.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <BookOpen className="w-3.5 h-3.5 text-grey-500" />
                  <span className="text-xs font-medium text-grey-400 uppercase tracking-wider">
                    Evidence to Cite
                  </span>
                </div>
                <div className="space-y-1.5">
                  {appealStrategy.evidence_to_cite.map((ev, idx) => {
                    const label = typeof ev === 'string'
                      ? ev
                      : (ev.description || ev.title || ev.source || JSON.stringify(ev)) as string
                    return (
                      <div key={idx} className="flex items-start gap-2 text-xs text-grey-600 px-3 py-2 bg-grey-50 rounded-lg border border-grey-100">
                        <Check className="w-3 h-3 text-grey-400 mt-0.5 shrink-0" />
                        <span>{label}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Policy sections + literature */}
            {(appealStrategy.policy_sections_to_reference.length > 0 || appealStrategy.medical_literature_citations.length > 0) && (
              <div className="grid grid-cols-2 gap-3">
                {appealStrategy.policy_sections_to_reference.length > 0 && (
                  <div className="bg-grey-50 rounded-xl border border-grey-100 p-3">
                    <span className="text-[10px] font-medium text-grey-400 uppercase tracking-wider">
                      Policy Sections
                    </span>
                    <div className="mt-2 space-y-1">
                      {appealStrategy.policy_sections_to_reference.map((s, idx) => (
                        <p key={idx} className="text-xs text-grey-600">{s}</p>
                      ))}
                    </div>
                  </div>
                )}
                {appealStrategy.medical_literature_citations.length > 0 && (
                  <div className="bg-grey-50 rounded-xl border border-grey-100 p-3">
                    <span className="text-[10px] font-medium text-grey-400 uppercase tracking-wider">
                      Literature
                    </span>
                    <div className="mt-2 space-y-1">
                      {appealStrategy.medical_literature_citations.map((c, idx) => (
                        <p key={idx} className="text-xs text-grey-600">{c}</p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Success reasoning */}
            {appealStrategy.success_probability_reasoning && (
              <div className="px-3 py-2.5 bg-grey-50 rounded-xl border border-grey-100">
                <span className="text-[10px] font-medium text-grey-400 uppercase tracking-wider">
                  Success Assessment
                </span>
                <p className="text-xs text-grey-600 mt-1 leading-relaxed">
                  {appealStrategy.success_probability_reasoning}
                </p>
              </div>
            )}

            {/* Key risks */}
            {appealStrategy.key_risks.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <ShieldAlert className="w-3.5 h-3.5 text-grey-500" />
                  <span className="text-xs font-medium text-grey-400 uppercase tracking-wider">
                    Key Risks
                  </span>
                </div>
                <div className="space-y-1.5">
                  {appealStrategy.key_risks.map((risk, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-xs text-grey-600 px-3 py-2 bg-grey-50 rounded-lg border border-grey-100">
                      <AlertCircle className="w-3 h-3 text-grey-400 mt-0.5 shrink-0" />
                      <span>{risk}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Fallback strategies */}
            {appealStrategy.fallback_strategies.length > 0 && (
              <div className="px-3 py-2.5 bg-grey-50 rounded-xl border border-grey-100">
                <span className="text-[10px] font-medium text-grey-400 uppercase tracking-wider">
                  Fallback Options
                </span>
                <div className="mt-1.5 space-y-1">
                  {appealStrategy.fallback_strategies.map((fb, idx) => (
                    <p key={idx} className="text-xs text-grey-600">
                      {idx + 1}. {fb}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </CollapsibleSection>

      {/* Section 2: Appeal Letter Draft */}
      <CollapsibleSection
        title="Draft Appeal Letter"
        icon={<FileText className="w-4 h-4" />}
        expanded={expandedSection === 'letter'}
        onToggle={() => setExpandedSection(expandedSection === 'letter' ? null : 'letter')}
      >
        {!appealLetter && !isLetterLoading && !letterMutation.isError ? (
          <div className="text-center py-6">
            <FileText className="w-8 h-8 text-grey-200 mx-auto mb-3" />
            <p className="text-sm text-grey-500 mb-1">Generate a draft appeal letter</p>
            <p className="text-xs text-grey-400 mb-4">
              {appealStrategy
                ? 'Uses the appeal strategy above to compose a clinical letter'
                : 'Generate the appeal strategy first for best results'}
            </p>
            <button
              type="button"
              onClick={handleDraftLetter}
              disabled={isLetterLoading}
              className={cn(
                'inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors',
                'bg-grey-900 text-white hover:bg-grey-800'
              )}
            >
              <FileText className="w-4 h-4" />
              Draft Appeal Letter
            </button>
          </div>
        ) : isLetterLoading ? (
          <div className="flex items-center gap-3 px-4 py-6 justify-center">
            <svg className="w-5 h-5 text-grey-400 animate-spin shrink-0" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-20" />
              <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
            <div>
              <p className="text-sm font-medium text-grey-700">Drafting appeal letter...</p>
              <p className="text-xs text-grey-400">Composing clinical appeal from strategy</p>
            </div>
          </div>
        ) : letterMutation.isError ? (
          <div className="text-center py-6">
            <AlertCircle className="w-6 h-6 text-grey-300 mx-auto mb-2" />
            <p className="text-sm font-medium text-grey-700 mb-1">Failed to draft letter</p>
            <p className="text-xs text-grey-400 mb-3">
              {letterMutation.error instanceof Error ? letterMutation.error.message : 'An error occurred'}
            </p>
            <button
              type="button"
              onClick={handleDraftLetter}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-grey-900 hover:bg-grey-800 rounded-lg transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              Retry
            </button>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, clipPath: 'inset(0 0 100% 0)' }}
            animate={{ opacity: 1, clipPath: 'inset(0 0 0% 0)' }}
            transition={{ duration: 2, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-3"
          >
            {/* Toolbar */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(!isEditing)}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors',
                    isEditing
                      ? 'bg-grey-900 text-white border-grey-900'
                      : 'bg-white text-grey-600 border-grey-200 hover:bg-grey-50'
                  )}
                >
                  <Pencil className="w-3 h-3" />
                  {isEditing ? 'Editing' : 'Edit'}
                </button>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border border-grey-200 bg-white text-grey-600 hover:bg-grey-50 transition-colors"
                >
                  {copied ? (
                    <><Check className="w-3 h-3 text-grey-900" /><span>Copied</span></>
                  ) : (
                    <><Copy className="w-3 h-3" /><span>Copy</span></>
                  )}
                </button>
              </div>
              <span className="text-[10px] text-grey-400">
                {wordCount} words / {charCount} chars
              </span>
            </div>

            {/* Letter content */}
            {isEditing ? (
              <textarea
                value={appealLetter}
                onChange={(e) => setAppealLetter(e.target.value)}
                className="w-full min-h-[320px] p-4 text-xs leading-relaxed font-mono bg-grey-50 border border-grey-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-grey-900/20 resize-y text-grey-800"
              />
            ) : (
              <div className="p-4 bg-grey-50 border border-grey-100 rounded-xl max-h-[400px] overflow-y-auto prose prose-sm prose-grey max-w-none prose-headings:text-grey-900 prose-headings:font-semibold prose-p:text-grey-700 prose-p:leading-relaxed prose-li:text-grey-700 prose-strong:text-grey-900 prose-a:text-grey-900 prose-hr:border-grey-200 text-xs">
                <Markdown>{appealLetter}</Markdown>
              </div>
            )}

            {/* Regenerate */}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => letterMutation.mutate()}
                disabled={isLetterLoading}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border border-grey-200 bg-white text-grey-500 hover:bg-grey-50 transition-colors disabled:opacity-50"
              >
                <RotateCcw className="w-3 h-3" />
                Regenerate
              </button>
            </div>
          </motion.div>
        )}
      </CollapsibleSection>

      {/* Section 3: Peer-to-Peer Preparation */}
      <CollapsibleSection
        title="Peer-to-Peer Preparation"
        icon={<UserCheck className="w-4 h-4" />}
        expanded={expandedSection === 'p2p'}
        onToggle={() => setExpandedSection(expandedSection === 'p2p' ? null : 'p2p')}
        badge={
          Object.values(p2pChecked).filter(Boolean).length > 0
            ? `${Object.values(p2pChecked).filter(Boolean).length}/${P2P_CHECKLIST_ITEMS.length}`
            : undefined
        }
      >
        <div className="space-y-3">
          {/* P2P talking points from strategy (if available) */}
          {appealStrategy?.peer_to_peer_talking_points && appealStrategy.peer_to_peer_talking_points.length > 0 && (
            <div className="bg-grey-50 rounded-xl border border-grey-100 p-4 mb-1">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-3.5 h-3.5 text-grey-500" />
                <span className="text-xs font-medium text-grey-400 uppercase tracking-wider">
                  AI-Generated Talking Points
                </span>
              </div>
              <div className="space-y-1.5">
                {appealStrategy.peer_to_peer_talking_points.map((point, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-xs text-grey-700">
                    <div className="w-4 h-4 rounded-full bg-grey-900 text-white flex items-center justify-center text-[9px] font-semibold shrink-0 mt-0.5">
                      {idx + 1}
                    </div>
                    <span className="leading-relaxed">{point}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Preparation checklist */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <ClipboardList className="w-3.5 h-3.5 text-grey-500" />
              <span className="text-xs font-medium text-grey-400 uppercase tracking-wider">
                Preparation Checklist
              </span>
            </div>
            <div className="space-y-1.5">
              {P2P_CHECKLIST_ITEMS.map((item, idx) => (
                <label
                  key={idx}
                  className={cn(
                    'flex items-start gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-colors',
                    p2pChecked[idx]
                      ? 'bg-grey-50 border-grey-300'
                      : 'bg-white border-grey-200 hover:bg-grey-50'
                  )}
                >
                  <div className="pt-0.5">
                    <div
                      className={cn(
                        'w-4 h-4 rounded border-2 flex items-center justify-center transition-colors',
                        p2pChecked[idx]
                          ? 'bg-grey-900 border-grey-900'
                          : 'bg-white border-grey-300'
                      )}
                    >
                      {p2pChecked[idx] && (
                        <Check className="w-2.5 h-2.5 text-white" />
                      )}
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={!!p2pChecked[idx]}
                    onChange={() => handleP2pToggle(idx)}
                    className="sr-only"
                  />
                  <span className={cn(
                    'text-xs leading-relaxed',
                    p2pChecked[idx] ? 'text-grey-500 line-through' : 'text-grey-700'
                  )}>
                    {item}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Urgency note */}
          {appealStrategy?.urgency_justification && (
            <div className="px-3 py-2.5 bg-grey-50 rounded-xl border border-grey-100">
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle className="w-3.5 h-3.5 text-grey-500" />
                <span className="text-[10px] font-medium text-grey-400 uppercase tracking-wider">
                  Urgency Note
                </span>
              </div>
              <p className="text-xs text-grey-600 leading-relaxed">
                {appealStrategy.urgency_justification}
              </p>
            </div>
          )}
        </div>
      </CollapsibleSection>
    </div>
  )
}

// ── Collapsible Section ──

interface CollapsibleSectionProps {
  title: string
  icon: ReactNode
  expanded: boolean
  onToggle: () => void
  badge?: string
  children: ReactNode
}

function CollapsibleSection({ title, icon, expanded, onToggle, badge, children }: CollapsibleSectionProps) {
  return (
    <div className="bg-white rounded-2xl border border-grey-200 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-grey-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-grey-500">{icon}</span>
          <span className="text-sm font-medium text-grey-900">{title}</span>
          {badge && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 bg-grey-100 text-grey-500 rounded">
              {badge}
            </span>
          )}
        </div>
        <ChevronDown className={cn(
          'w-4 h-4 text-grey-400 transition-transform duration-200',
          expanded && 'rotate-180'
        )} />
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default AppealPanel
