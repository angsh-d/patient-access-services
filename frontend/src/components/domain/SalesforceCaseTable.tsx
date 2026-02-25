import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowUp, ArrowDown, Check } from 'lucide-react'
import type { CaseState } from '@/types/case'
import {
  formatCaseNumber,
  generatePDIPool,
  deriveEligibility,
  deriveImpact,
  deriveRiskLevel,
  derivePlanType,
  formatApprovalLikelihood,
  derivePARequired,
  derivePolicyVersion,
  getPrimaryAssessment,
} from '@/lib/salesforceHelpers'

interface SalesforceCaseTableProps {
  cases: CaseState[]
  searchTerm: string
  selectedIds: Set<string>
  onSelectionChange: (ids: Set<string>) => void
  sortField: SortField
  sortDir: SortDir
  onSortChange: (field: SortField, dir: SortDir) => void
}

export type SortField =
  | 'caseNumber'
  | 'pdiPool'
  | 'subject'
  | 'medication'
  | 'medicationBrand'
  | 'policyVersion'
  | 'eligibility'
  | 'paRequired'
  | 'impact'
  | 'riskLevel'
  | 'approvalLikelihood'
  | 'planType'
  | 'indication'

export type SortDir = 'asc' | 'desc'

function getSortValue(cs: CaseState, field: SortField, index: number): string | number {
  switch (field) {
    case 'caseNumber': return index
    case 'pdiPool': return generatePDIPool(cs.medication?.medication_name, index)
    case 'subject': return `${cs.patient?.first_name} ${cs.patient?.last_name}`
    case 'medication': return cs.medication?.generic_name || ''
    case 'medicationBrand': return cs.medication?.medication_name || ''
    case 'policyVersion': return derivePolicyVersion(cs)
    case 'eligibility': return deriveEligibility(cs).label
    case 'paRequired': return derivePARequired(cs) ? 1 : 0
    case 'impact': return deriveImpact(cs).label
    case 'riskLevel': {
      const a = getPrimaryAssessment(cs)
      return deriveRiskLevel(a?.approval_likelihood)
    }
    case 'approvalLikelihood': {
      const a = getPrimaryAssessment(cs)
      return a?.approval_likelihood ?? -1
    }
    case 'planType': return derivePlanType(cs.patient?.primary_payer)
    case 'indication': return cs.medication?.diagnosis || ''
    default: return ''
  }
}

export function SalesforceCaseTable({
  cases,
  searchTerm,
  selectedIds,
  onSelectionChange,
  sortField,
  sortDir,
  onSortChange,
}: SalesforceCaseTableProps) {
  const navigate = useNavigate()

  const filtered = useMemo(() => {
    if (!searchTerm) return cases
    const term = searchTerm.toLowerCase()
    return cases.filter((cs) => {
      const name = `${cs.patient?.first_name} ${cs.patient?.last_name}`.toLowerCase()
      const med = (cs.medication?.medication_name || '').toLowerCase()
      const generic = (cs.medication?.generic_name || '').toLowerCase()
      const diag = (cs.medication?.diagnosis || '').toLowerCase()
      const id = cs.case_id.toLowerCase()
      return name.includes(term) || med.includes(term) || generic.includes(term) || diag.includes(term) || id.includes(term)
    })
  }, [cases, searchTerm])

  const sorted = useMemo(() => {
    const withIndex = filtered.map((cs) => ({ cs, origIndex: cases.indexOf(cs) }))
    withIndex.sort((a, b) => {
      const av = getSortValue(a.cs, sortField, a.origIndex)
      const bv = getSortValue(b.cs, sortField, b.origIndex)
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))
      return sortDir === 'asc' ? cmp : -cmp
    })
    return withIndex
  }, [filtered, cases, sortField, sortDir])

  const allSelected = sorted.length > 0 && sorted.every((r) => selectedIds.has(r.cs.case_id))

  function toggleSelectAll() {
    if (allSelected) {
      onSelectionChange(new Set())
    } else {
      onSelectionChange(new Set(sorted.map((r) => r.cs.case_id)))
    }
  }

  function toggleSelect(id: string) {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onSelectionChange(next)
  }

  function handleSort(field: SortField) {
    if (sortField === field) {
      onSortChange(field, sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      onSortChange(field, 'asc')
    }
  }

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null
    return sortDir === 'asc' ? (
      <ArrowUp className="w-3 h-3 ml-0.5 inline" />
    ) : (
      <ArrowDown className="w-3 h-3 ml-0.5 inline" />
    )
  }

  const columns: { key: SortField; label: string; minW?: string }[] = [
    { key: 'caseNumber', label: 'Case Number', minW: '110px' },
    { key: 'pdiPool', label: 'PDI Pool', minW: '90px' },
    { key: 'subject', label: 'Subject', minW: '200px' },
    { key: 'medication', label: 'Medication', minW: '120px' },
    { key: 'medicationBrand', label: 'Medication Brand', minW: '140px' },
    { key: 'policyVersion', label: 'Policy Version', minW: '100px' },
    { key: 'eligibility', label: 'Eligibility', minW: '100px' },
    { key: 'paRequired', label: 'PA Required', minW: '90px' },
    { key: 'impact', label: 'Impact', minW: '100px' },
    { key: 'riskLevel', label: 'Risk Level', minW: '100px' },
    { key: 'approvalLikelihood', label: 'Approval Likelihood', minW: '130px' },
    { key: 'planType', label: 'Plan Type', minW: '110px' },
    { key: 'indication', label: 'Indication', minW: '180px' },
  ]

  return (
    <div className="overflow-x-auto bg-white">
      <table className="w-full min-w-[1400px]">
        <thead>
          <tr>
            <th className="sf-table-header-cell" style={{ width: '40px', textAlign: 'center' }}>#</th>
            <th className="sf-table-header-cell" style={{ width: '36px', textAlign: 'center' }}>
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                className="w-3.5 h-3.5 rounded border-gray-300 accent-salesforce-blue cursor-pointer"
              />
            </th>
            {columns.map((col) => (
              <th
                key={col.key}
                className="sf-table-header-cell cursor-pointer hover:bg-gray-100 transition-colors"
                style={{ minWidth: col.minW }}
                onClick={() => handleSort(col.key)}
              >
                {col.label}
                <SortIcon field={col.key} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map(({ cs, origIndex }, displayIdx) => {
            const assessment = getPrimaryAssessment(cs)
            const eligibility = deriveEligibility(cs)
            const impact = deriveImpact(cs)
            const riskLevel = deriveRiskLevel(assessment?.approval_likelihood)
            const paRequired = derivePARequired(cs)
            const isSelected = selectedIds.has(cs.case_id)

            return (
              <tr
                key={cs.case_id}
                className="sf-table-row cursor-pointer transition-colors"
                style={{ background: isSelected ? '#EEF4FF' : undefined }}
                onClick={() => navigate(`/cases/${cs.case_id}`)}
              >
                <td className="sf-table-cell text-center" style={{ color: '#706E6B' }}>{displayIdx + 1}</td>
                <td className="sf-table-cell text-center" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(cs.case_id)}
                    className="w-3.5 h-3.5 rounded border-gray-300 accent-salesforce-blue cursor-pointer"
                  />
                </td>
                <td className="sf-table-cell">
                  <span className="sf-link font-medium" onClick={(e) => { e.stopPropagation(); navigate(`/cases/${cs.case_id}`) }}>
                    {formatCaseNumber(origIndex)}
                  </span>
                </td>
                <td className="sf-table-cell">{generatePDIPool(cs.medication?.medication_name, origIndex)}</td>
                <td className="sf-table-cell">
                  <span className="sf-link" onClick={(e) => { e.stopPropagation(); navigate(`/cases/${cs.case_id}`) }}>
                    Infliximab Referral &mdash; {cs.patient?.first_name} {cs.patient?.last_name}
                  </span>
                </td>
                <td className="sf-table-cell" style={{ textTransform: 'lowercase' }}>
                  {cs.medication?.generic_name || '--'}
                </td>
                <td className="sf-table-cell">
                  {cs.medication?.medication_name || `generic ${cs.medication?.generic_name || '--'}`}
                </td>
                <td className="sf-table-cell">{derivePolicyVersion(cs)}</td>
                <td className="sf-table-cell">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: eligibility.color }} />
                    <span style={{ color: eligibility.color, fontWeight: 500 }}>{eligibility.label}</span>
                  </span>
                </td>
                <td className="sf-table-cell text-center">
                  {paRequired ? (
                    <Check className="w-4 h-4 text-salesforce-success mx-auto" />
                  ) : (
                    <span style={{ color: '#706E6B' }}>&mdash;</span>
                  )}
                </td>
                <td className="sf-table-cell">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: impact.dotColor }} />
                    {impact.label}
                  </span>
                </td>
                <td className="sf-table-cell">
                  <span
                    className="text-xs font-medium px-2 py-0.5 rounded-full"
                    style={{
                      background:
                        riskLevel === 'Verdict Flip' ? '#FEE2E2' :
                        riskLevel === 'At Risk' ? '#FEF3C7' : '#E8F5E9',
                      color:
                        riskLevel === 'Verdict Flip' ? '#991B1B' :
                        riskLevel === 'At Risk' ? '#92400E' : '#166534',
                    }}
                  >
                    {riskLevel}
                  </span>
                </td>
                <td className="sf-table-cell font-mono text-xs">
                  {formatApprovalLikelihood(assessment?.approval_likelihood)}
                </td>
                <td className="sf-table-cell">{derivePlanType(cs.patient?.primary_payer)}</td>
                <td className="sf-table-cell" style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {cs.medication?.diagnosis || '--'}
                </td>
              </tr>
            )
          })}

          {sorted.length === 0 && (
            <tr>
              <td colSpan={15} className="sf-table-cell text-center py-8" style={{ color: '#706E6B' }}>
                {searchTerm ? 'No cases match your search.' : 'No cases found.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
