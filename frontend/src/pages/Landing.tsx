import { useRef } from 'react'
import { motion, useScroll, useTransform, useInView } from 'framer-motion'
import { useNavigate } from 'react-router-dom'

const platformTitle = 'Prior Auth Agent'

function NavBar() {
  const navigate = useNavigate()

  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="fixed top-0 left-0 right-0 z-50"
      style={{
        background: 'rgba(251, 251, 253, 0.72)',
        backdropFilter: 'saturate(180%) blur(20px)',
        WebkitBackdropFilter: 'saturate(180%) blur(20px)',
        borderBottom: '0.5px solid rgba(0, 0, 0, 0.06)',
      }}
    >
      <div className="flex items-center justify-between h-[44px] px-6">
        <div className="flex items-center gap-0">
          <img
            src="/saama_logo.svg"
            alt="Saama"
            style={{ height: '22px', width: 'auto' }}
          />
          <div
            style={{
              width: '1px',
              height: '18px',
              background: 'rgba(0, 0, 0, 0.15)',
              marginLeft: '14px',
              marginRight: '14px',
              flexShrink: 0,
            }}
          />
          <span className="text-sm font-medium text-grey-900" style={{ letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
            {platformTitle}
          </span>
        </div>

        <div className="hidden md:flex items-center gap-8">
          <a href="#platform" className="text-xs text-grey-500 hover:text-grey-900 transition-colors duration-300" style={{ letterSpacing: '-0.003em' }}>
            Platform
          </a>
          <a href="#workflow" className="text-xs text-grey-500 hover:text-grey-900 transition-colors duration-300" style={{ letterSpacing: '-0.003em' }}>
            How It Works
          </a>
          <a href="#intelligence" className="text-xs text-grey-500 hover:text-grey-900 transition-colors duration-300" style={{ letterSpacing: '-0.003em' }}>
            Intelligence
          </a>
        </div>

        <button
          onClick={() => navigate('/dashboard')}
          className="h-[28px] px-3.5 rounded-full text-[11px] font-medium text-white transition-all duration-300"
          style={{
            background: '#1c1c1e',
            letterSpacing: '-0.003em',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#48484a'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#1c1c1e'
          }}
        >
          Open Platform
        </button>
      </div>
    </motion.nav>
  )
}

function FadeInSection({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-80px' })

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
      transition={{ duration: 0.8, delay, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

function HeroSection() {
  const navigate = useNavigate()
  const ref = useRef(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start start', 'end start'],
  })
  const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0])
  const scale = useTransform(scrollYProgress, [0, 0.5], [1, 0.96])
  const y = useTransform(scrollYProgress, [0, 0.5], [0, 60])

  return (
    <motion.section
      ref={ref}
      className="relative flex flex-col items-center justify-center overflow-hidden"
      style={{ background: '#fbfbfd', position: 'relative', minHeight: '100vh', paddingTop: '44px', paddingBottom: '40px' }}
    >
      <motion.div
        className="relative z-10 max-w-[720px] mx-auto text-center px-6"
        style={{ opacity, scale, y }}
      >
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="mb-3"
        >
          <span
            className="inline-flex items-center gap-1.5 h-[26px] px-3 rounded-full text-[11px] font-medium text-grey-600"
            style={{
              background: 'rgba(0, 0, 0, 0.03)',
              border: '0.5px solid rgba(0, 0, 0, 0.06)',
              letterSpacing: '0.01em',
            }}
          >
            <span className="w-[5px] h-[5px] rounded-full bg-semantic-success animate-pulse" />
            Prior Auth Agent
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="text-grey-900 font-bold mb-4"
          style={{
            fontSize: 'clamp(2.5rem, 5.5vw, 4rem)',
            lineHeight: '1.08',
            letterSpacing: '-0.04em',
          }}
        >
          <>Approvals faster.{' '}<br className="hidden sm:block" />Denials fewer.</>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="mb-8 mx-auto max-w-[520px]"
          style={{
            fontSize: 'clamp(1rem, 2vw, 1.1875rem)',
            lineHeight: '1.5',
            letterSpacing: '-0.014em',
            color: '#86868b',
          }}
        >
          AI that reads payer policies, interprets patient data, prevents denials before they happen, and learns from every past submission.
        </motion.p>

        {/* Four key functions */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="grid grid-cols-2 gap-x-8 gap-y-3 mb-8 max-w-[480px] mx-auto"
        >
          {[
            { label: 'Policy Interpretation', desc: 'Reads and reasons over payer coverage criteria' },
            { label: 'Patient Data Analysis', desc: 'Matches clinical evidence to policy requirements' },
            { label: 'Proactive Denial Prevention', desc: 'Flags gaps and compensating factors before submission' },
            { label: 'Predictive Intelligence', desc: 'Learns from historical submissions to forecast outcomes' },
          ].map((item, idx) => (
            <div key={idx} className="text-left">
              <p className="text-[13px] font-semibold text-grey-900" style={{ letterSpacing: '-0.01em' }}>
                {item.label}
              </p>
              <p className="text-[11px] text-grey-500 mt-0.5" style={{ lineHeight: '1.4' }}>
                {item.desc}
              </p>
            </div>
          ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="flex items-center justify-center gap-3"
        >
          <button
            onClick={() => navigate('/dashboard')}
            className="h-[44px] px-7 rounded-full text-[15px] font-medium text-white transition-all duration-300 hover:shadow-lg active:scale-[0.97]"
            style={{
              background: '#1c1c1e',
              letterSpacing: '-0.01em',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#2c2c2e'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#1c1c1e'
            }}
          >
            Get Started
          </button>
          <a
            href="#platform"
            className="h-[44px] px-7 rounded-full text-[15px] font-medium text-grey-900 transition-all duration-300 hover:bg-black/[0.04] active:scale-[0.97] inline-flex items-center"
            style={{ letterSpacing: '-0.01em' }}
          >
            Learn more
            <svg className="ml-1.5 w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </a>
        </motion.div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.5, delay: 0.9 }}
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 70% 50% at 50% 45%, rgba(0, 122, 255, 0.04) 0%, transparent 70%)',
        }}
      />
    </motion.section>
  )
}

function PlatformSection() {
  const navigate = useNavigate()

  const capabilities: Array<{
    title: string
    description: string
    icon: React.ReactNode
    navigateTo?: string
  }> = [
    {
      title: 'Benefit Verification',
      description: 'Instantly verify patient eligibility, coverage details, and plan-specific requirements across any payer.',
      icon: (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <rect x="3" y="6" width="22" height="16" rx="3" stroke="currentColor" strokeWidth="1.5" />
          <path d="M3 11H25" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 16H14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M8 19H11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      title: 'Prior Authorization',
      description: 'Autonomous agents analyze policies, build clinical arguments, and manage the full PA lifecycle from submission to approval.',
      icon: (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <rect x="3" y="4" width="22" height="20" rx="3" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 10H20M8 14H16M8 18H12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M19 15L21 17L25 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
    {
      title: 'Payer Strategy',
      description: 'AI-generated strategies scored by approval probability, adapting to payer-specific patterns and requirements.',
      icon: (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <path d="M14 4L24 10V18L14 24L4 18V10L14 4Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M14 12L19 9.5M14 12L9 9.5M14 12V18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
    {
      title: 'Appeals Management',
      description: 'When claims are denied, AI builds comprehensive appeal packages with clinical evidence and policy citations.',
      icon: (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <path d="M14 4V12L20 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M6 14C6 18.418 9.582 22 14 22C18.418 22 22 18.418 22 14C22 9.582 18.418 6 14 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      title: 'Coverage Intelligence',
      description: 'Real-time insights into coverage landscapes, formulary positioning, and step-therapy requirements across payers.',
      icon: (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <circle cx="14" cy="14" r="10" stroke="currentColor" strokeWidth="1.5" />
          <path d="M14 8V14L18 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
    {
      title: 'Workflow Orchestration',
      description: 'End-to-end coordination across teams with human-in-the-loop gates at every critical decision point.',
      icon: (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <circle cx="14" cy="7" r="3" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="7" cy="21" r="3" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="21" cy="21" r="3" stroke="currentColor" strokeWidth="1.5" />
          <path d="M14 10V14L7 18M14 14L21 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      title: 'Policy Intelligence',
      description: 'Upload, digitize, and version-track payer policies. Compare amendments with AI-powered change analysis.',
      icon: (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <rect x="4" y="3" width="16" height="22" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 9H16M8 13H14M8 17H12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M20 10L24 14L20 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M24 14H20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      ),
      navigateTo: '/policies',
    },
  ]

  return (
    <section id="platform" className="py-28 px-6" style={{ background: '#ffffff' }}>
      <div className="max-w-[980px] mx-auto">
        <FadeInSection className="text-center mb-20">
          <p className="text-sm font-medium text-accent mb-3" style={{ letterSpacing: '-0.003em' }}>
            The Platform
          </p>
          <h2
            className="text-grey-900 font-bold mb-5"
            style={{
              fontSize: 'clamp(2rem, 4vw, 3rem)',
              lineHeight: '1.1',
              letterSpacing: '-0.035em',
            }}
          >
            Every barrier between patient{' '}
            <br className="hidden sm:block" />
            and treatment. Addressed.
          </h2>
          <p className="max-w-[520px] mx-auto" style={{ color: '#86868b', fontSize: '1.0625rem', lineHeight: '1.55', letterSpacing: '-0.012em' }}>
            A unified platform that orchestrates the entire patient access journey — from eligibility through approval.
          </p>
        </FadeInSection>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {capabilities.map((cap, i) => (
            <FadeInSection key={cap.title} delay={i * 0.08}>
              <div
                className="group p-7 rounded-2xl transition-all duration-500 h-full"
                style={{
                  background: '#f5f5f7',
                  border: '0.5px solid transparent',
                  cursor: cap.navigateTo ? 'pointer' : 'default',
                }}
                onClick={cap.navigateTo ? () => navigate(cap.navigateTo!) : undefined}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#ffffff'
                  e.currentTarget.style.border = '0.5px solid rgba(0, 0, 0, 0.06)'
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.04), 0 8px 24px rgba(0, 0, 0, 0.06)'
                  e.currentTarget.style.transform = 'translateY(-2px)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#f5f5f7'
                  e.currentTarget.style.border = '0.5px solid transparent'
                  e.currentTarget.style.boxShadow = 'none'
                  e.currentTarget.style.transform = 'translateY(0)'
                }}
              >
                <div className="text-grey-900 mb-4">
                  {cap.icon}
                </div>
                <h3
                  className="text-grey-900 font-semibold mb-2"
                  style={{ fontSize: '1.0625rem', letterSpacing: '-0.018em' }}
                >
                  {cap.title}
                </h3>
                <p className="text-grey-500 leading-relaxed" style={{ fontSize: '0.875rem', letterSpacing: '-0.006em' }}>
                  {cap.description}
                </p>
              </div>
            </FadeInSection>
          ))}
        </div>
      </div>
    </section>
  )
}

function WorkflowSection() {
  const steps = [
    {
      number: '01',
      title: 'Intake & Verification',
      description: 'Patient demographics, insurance details, and clinical data are captured. Eligibility and benefits are verified in real time.',
    },
    {
      number: '02',
      title: 'Policy Analysis',
      description: 'AI agents identify relevant payer policies, extract coverage criteria, and map them against the patient\'s clinical profile.',
    },
    {
      number: '03',
      title: 'Strategy & Submission',
      description: 'Optimal access strategies are generated, scored by approval probability, and submitted with supporting clinical evidence.',
    },
    {
      number: '04',
      title: 'Monitor & Resolve',
      description: 'The system tracks decisions, manages appeals, coordinates peer-to-peer reviews, and escalates when human judgment is needed.',
    },
  ]

  return (
    <section id="workflow" className="py-28 px-6" style={{ background: '#fbfbfd' }}>
      <div className="max-w-[980px] mx-auto">
        <FadeInSection className="text-center mb-20">
          <p className="text-sm font-medium text-accent mb-3" style={{ letterSpacing: '-0.003em' }}>
            How It Works
          </p>
          <h2
            className="text-grey-900 font-bold mb-5"
            style={{
              fontSize: 'clamp(2rem, 4vw, 3rem)',
              lineHeight: '1.1',
              letterSpacing: '-0.035em',
            }}
          >
            From verification{' '}
            <br className="hidden sm:block" />
            to resolution.
          </h2>
          <p className="max-w-[440px] mx-auto" style={{ color: '#86868b', fontSize: '1.0625rem', lineHeight: '1.55', letterSpacing: '-0.012em' }}>
            An intelligent pipeline that navigates every step of the access journey with precision and transparency.
          </p>
        </FadeInSection>

        <div className="relative">
          <div
            className="hidden md:block absolute left-[39px] top-8 bottom-8 w-px"
            style={{ background: 'rgba(0, 0, 0, 0.08)' }}
          />

          <div className="space-y-6">
            {steps.map((step, i) => (
              <FadeInSection key={step.number} delay={i * 0.1}>
                <div className="flex items-start gap-8 group">
                  <div className="flex-shrink-0 relative">
                    <div
                      className="w-[80px] h-[80px] rounded-2xl flex items-center justify-center transition-all duration-500 group-hover:shadow-lg"
                      style={{
                        background: '#ffffff',
                        border: '0.5px solid rgba(0, 0, 0, 0.06)',
                        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
                      }}
                    >
                      <span
                        className="text-grey-300 font-bold transition-colors duration-500 group-hover:text-grey-900"
                        style={{ fontSize: '1.5rem', letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}
                      >
                        {step.number}
                      </span>
                    </div>
                  </div>
                  <div className="pt-5">
                    <h3
                      className="text-grey-900 font-semibold mb-1.5"
                      style={{ fontSize: '1.1875rem', letterSpacing: '-0.02em' }}
                    >
                      {step.title}
                    </h3>
                    <p className="text-grey-500" style={{ fontSize: '0.9375rem', lineHeight: '1.6', letterSpacing: '-0.009em', maxWidth: '440px' }}>
                      {step.description}
                    </p>
                  </div>
                </div>
              </FadeInSection>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function IntelligenceSection() {
  const agents = [
    { name: 'Claude', role: 'Strategy & Clinical Reasoning', color: '#d4a574' },
    { name: 'Gemini', role: 'Policy & Coverage Analysis', color: '#7eb8da' },
    { name: 'Azure OpenAI', role: 'Document Intelligence', color: '#a8c5a0' },
  ]

  return (
    <section id="intelligence" className="py-28 px-6" style={{ background: '#000000' }}>
      <div className="max-w-[980px] mx-auto">
        <FadeInSection className="text-center mb-16">
          <p className="text-sm font-medium mb-3" style={{ color: 'rgba(255, 255, 255, 0.5)', letterSpacing: '-0.003em' }}>
            Multi-Model Intelligence
          </p>
          <h2
            className="text-white font-bold mb-5"
            style={{
              fontSize: 'clamp(2rem, 4vw, 3rem)',
              lineHeight: '1.1',
              letterSpacing: '-0.035em',
            }}
          >
            Three models.{' '}
            <br className="hidden sm:block" />
            One strategy.
          </h2>
          <p className="max-w-[460px] mx-auto" style={{ color: 'rgba(255, 255, 255, 0.45)', fontSize: '1.0625rem', lineHeight: '1.55', letterSpacing: '-0.012em' }}>
            Frontier AI models work in concert — analyzing policies, reasoning through clinical evidence, and building the strongest possible case for access.
          </p>
        </FadeInSection>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {agents.map((agent, i) => (
            <FadeInSection key={agent.name} delay={i * 0.12}>
              <div
                className="p-6 rounded-2xl transition-all duration-500"
                style={{
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '0.5px solid rgba(255, 255, 255, 0.08)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.07)'
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)'
                  e.currentTarget.style.transform = 'translateY(-2px)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)'
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)'
                  e.currentTarget.style.transform = 'translateY(0)'
                }}
              >
                <div
                  className="w-10 h-10 rounded-xl mb-4 flex items-center justify-center"
                  style={{ background: `${agent.color}20`, border: `0.5px solid ${agent.color}30` }}
                >
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: agent.color }} />
                </div>
                <h3
                  className="text-white font-semibold mb-1"
                  style={{ fontSize: '1.0625rem', letterSpacing: '-0.018em' }}
                >
                  {agent.name}
                </h3>
                <p style={{ color: 'rgba(255, 255, 255, 0.45)', fontSize: '0.875rem', letterSpacing: '-0.006em' }}>
                  {agent.role}
                </p>
              </div>
            </FadeInSection>
          ))}
        </div>
      </div>
    </section>
  )
}

function DesignedForSection() {
  const principles = [
    {
      title: 'Built for complexity',
      description: 'Healthcare access is tangled in payer-specific rules, clinical criteria, and regulatory nuance. This platform was designed to navigate that complexity autonomously.',
    },
    {
      title: 'Human oversight at every gate',
      description: 'AI handles the analysis and coordination. Your team retains full decision authority at every critical step — approve, override, or redirect.',
    },
    {
      title: 'Transparent reasoning',
      description: 'Every recommendation comes with the evidence and logic behind it. No black boxes. Full audit trails for every case.',
    },
  ]

  return (
    <section className="py-28 px-6" style={{ background: '#ffffff' }}>
      <div className="max-w-[980px] mx-auto">
        <FadeInSection className="text-center mb-16">
          <h2
            className="text-grey-900 font-bold mb-5"
            style={{
              fontSize: 'clamp(2rem, 4vw, 3rem)',
              lineHeight: '1.1',
              letterSpacing: '-0.035em',
            }}
          >
            Designed for the{' '}
            <br className="hidden sm:block" />
            way access actually works.
          </h2>
        </FadeInSection>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {principles.map((principle, i) => (
            <FadeInSection key={principle.title} delay={i * 0.1} className="text-center md:text-left">
              <h3
                className="text-grey-900 font-semibold mb-2"
                style={{ fontSize: '1.0625rem', letterSpacing: '-0.018em' }}
              >
                {principle.title}
              </h3>
              <p className="leading-relaxed" style={{ color: '#86868b', fontSize: '0.9375rem', letterSpacing: '-0.009em', lineHeight: '1.6' }}>
                {principle.description}
              </p>
            </FadeInSection>
          ))}
        </div>
      </div>
    </section>
  )
}

function CTASection() {
  const navigate = useNavigate()

  return (
    <section className="py-28 px-6" style={{ background: '#fbfbfd' }}>
      <div className="max-w-[580px] mx-auto text-center">
        <FadeInSection>
          <h2
            className="text-grey-900 font-bold mb-5"
            style={{
              fontSize: 'clamp(2rem, 4vw, 3rem)',
              lineHeight: '1.1',
              letterSpacing: '-0.035em',
            }}
          >
            Every patient deserves{' '}
            <br className="hidden sm:block" />
            access.
          </h2>
          <p className="mb-10 mx-auto max-w-[420px]" style={{ color: '#86868b', fontSize: '1.0625rem', lineHeight: '1.55', letterSpacing: '-0.012em' }}>
            Start navigating benefit verification, prior authorization, and payer strategy with AI-powered intelligence.
          </p>
          <button
            onClick={() => navigate('/dashboard')}
            className="h-[50px] px-8 rounded-full text-[16px] font-medium text-white transition-all duration-300 hover:shadow-xl active:scale-[0.97]"
            style={{
              background: '#1c1c1e',
              letterSpacing: '-0.01em',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#2c2c2e'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#1c1c1e'
            }}
          >
            Open Platform
          </button>
        </FadeInSection>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="py-6 px-6" style={{ background: '#f5f5f7', borderTop: '0.5px solid rgba(0, 0, 0, 0.06)' }}>
      <div className="max-w-[980px] mx-auto flex items-center justify-between">
        <p className="text-grey-400" style={{ fontSize: '0.75rem', letterSpacing: '-0.003em' }}>
          Access Strategy Platform
        </p>
        <p className="text-grey-300" style={{ fontSize: '0.6875rem' }}>
          Intelligent Patient Access
        </p>
      </div>
    </footer>
  )
}

export default function Landing() {
  return (
    <div className="min-h-screen" style={{ background: '#fbfbfd' }}>
      <NavBar />
      <HeroSection />
      <PlatformSection />
      <WorkflowSection />
      <IntelligenceSection />
      <DesignedForSection />
      <CTASection />
      <Footer />
    </div>
  )
}
