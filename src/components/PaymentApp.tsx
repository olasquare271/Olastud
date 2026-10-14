import { useState, useCallback } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { erc20Abi, isAddress } from 'viem'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowUpRight, ExternalLink, Loader2, Send, CheckCircle2, AlertCircle, X, ChevronRight } from 'lucide-react'
import { TokenUSDC } from '@web3icons/react'
import { getUsdc, requireChain, buildTxExplorerUrl } from '@/onchain-facts'
import { Amount, usdcDecimalsFor } from '@/onchain-money'
import { parseUnitsExact } from '@/onchain-money'

const ARC_TESTNET_CHAIN_ID = 5042002
const usdcFact = getUsdc(ARC_TESTNET_CHAIN_ID)!
const USDC_ADDRESS = usdcFact.address as `0x${string}`
const CHAIN = requireChain(ARC_TESTNET_CHAIN_ID)

const QUICK_AMOUNTS = ['0.10', '0.25', '0.50', '1.00']

function formatAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function parseOnchainError(error: unknown): string {
  const msg = (error as { message?: string })?.message?.toLowerCase() ?? ''
  if (msg.includes('user rejected') || msg.includes('user denied')) return 'Cancelled.'
  if (msg.includes('insufficient') || msg.includes('exceeds balance')) return 'Insufficient balance.'
  if (msg.includes('reverted')) return 'Transaction failed on-chain.'
  if (msg.includes('network') || msg.includes('timeout')) return 'Network error — try again.'
  return 'Something went wrong. Try again.'
}

interface TxRecord {
  hash: `0x${string}`
  to: string
  amount: string
  ts: number
}

const glass = {
  card: {
    background: 'rgba(255,255,255,0.72)',
    backdropFilter: 'blur(24px) saturate(180%)',
    WebkitBackdropFilter: 'blur(24px) saturate(180%)',
    border: '1px solid rgba(18,45,69,0.10)',
    borderRadius: '24px',
  } as React.CSSProperties,
  inner: {
    background: 'rgba(245,245,248,0.80)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    border: '1px solid rgba(18,45,69,0.08)',
    borderRadius: '16px',
  } as React.CSSProperties,
}

const spectral = 'linear-gradient(90deg,#6366f1,#8b5cf6,#ec4899,#f59e0b,#10b981)'

export default function PaymentApp() {
  const { address, chainId, isConnected } = useAccount()
  const { switchChain, isPending: isSwitching } = useSwitchChain()

  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [memo, setMemo] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [txHistory, setTxHistory] = useState<TxRecord[]>([])

  // USDC balance
  const { data: rawBalance, isLoading: balanceLoading, refetch: refetchBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: !!address },
  })

  const formattedBalance =
    rawBalance != null
      ? Amount.fromRaw(rawBalance, usdcDecimalsFor(ARC_TESTNET_CHAIN_ID)).toFixed(2)
      : null

  // Write contract
  const {
    writeContract,
    data: txHash,
    isPending,
    isError: isWriteError,
    error: writeError,
    reset,
  } = useWriteContract()

  const {
    isLoading: isConfirming,
    isSuccess,
    isError: isReceiptError,
  } = useWaitForTransactionReceipt({ hash: txHash })

  const wrongChain = isConnected && chainId !== ARC_TESTNET_CHAIN_ID

  // Validation
  const recipientValid = isAddress(recipient)
  const amountNum = parseFloat(amount)
  const amountValid = amount !== '' && !isNaN(amountNum) && amountNum > 0
  const canSend = isConnected && !wrongChain && recipientValid && amountValid && !isPending && !isConfirming

  const handleSend = useCallback(() => {
    if (!canSend) return
    const raw = parseUnitsExact(amount, usdcDecimalsFor(ARC_TESTNET_CHAIN_ID))
    writeContract({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [recipient, raw],
      chainId: ARC_TESTNET_CHAIN_ID,
    })
  }, [canSend, amount, recipient, writeContract])

  // Record tx on success
  if (isSuccess && txHash && !txHistory.find((r) => r.hash === txHash)) {
    setTxHistory((prev) => [{ hash: txHash, to: recipient, amount, ts: Date.now() }, ...prev.slice(0, 9)])
    void refetchBalance()
  }

  const handleReset = () => {
    reset()
    setRecipient('')
    setAmount('')
    setMemo('')
    setSheetOpen(false)
  }

  const txUrl = txHash ? buildTxExplorerUrl(ARC_TESTNET_CHAIN_ID, txHash) : null
  const errorMsg = (isWriteError || isReceiptError) ? parseOnchainError(writeError) : null

  return (
    <div
      className="min-h-dvh flex flex-col items-center px-4 py-8"
      style={{ background: 'var(--bg-gradient)' }}
    >
      {/* Header */}
      <header className="w-full max-w-md flex items-center justify-between mb-8">
        <div className="flex items-center gap-2">
          <div
            className="flex size-8 items-center justify-center rounded-xl"
            style={{ background: 'var(--accent)' }}
          >
            <Send className="size-4 text-white" />
          </div>
          <span className="display text-lg font-semibold" style={{ color: 'var(--ink)' }}>
            Arc Pay
          </span>
        </div>
        <ConnectKitButton />
      </header>

      {/* Balance card */}
      <section className="w-full max-w-md mb-4 p-5" style={glass.card}>
        <div className="h-1 rounded-full mb-4" style={{ background: spectral }} />
        <div className="flex items-center gap-2 mb-3">
          <TokenUSDC variant="branded" size={20} />
          <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: 'var(--muted)' }}>
            USDC Balance · {CHAIN.name}
          </span>
        </div>
        {!isConnected ? (
          <p className="display text-3xl font-bold tabular-nums" style={{ color: 'var(--subtle)' }}>
            —
          </p>
        ) : balanceLoading ? (
          <div className="flex items-baseline gap-2">
            <div className="h-9 w-28 rounded-lg bg-slate-100 animate-pulse" />
          </div>
        ) : (
          <div className="flex items-baseline gap-1.5">
            <span className="display text-4xl font-bold tabular-nums" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>
              {formattedBalance ?? '0.00'}
            </span>
            <span className="text-lg font-medium" style={{ color: 'var(--subtle)' }}>USDC</span>
          </div>
        )}
        {isConnected && address && (
          <p className="mt-1.5 text-xs mono" style={{ color: 'var(--muted)' }}>
            {formatAddress(address)}
          </p>
        )}

        {wrongChain && (
          <button
            onClick={() => switchChain({ chainId: ARC_TESTNET_CHAIN_ID })}
            disabled={isSwitching}
            className="mt-3 w-full rounded-xl py-2 text-xs font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
            style={{ background: 'var(--danger)' }}
          >
            {isSwitching ? 'Switching…' : `Switch to ${CHAIN.name}`}
          </button>
        )}
      </section>

      {/* Quick actions */}
      <div className="w-full max-w-md mb-4 grid grid-cols-2 gap-3">
        <button
          onClick={() => { if (isConnected) setSheetOpen(true) }}
          disabled={!isConnected}
          className="flex items-center justify-between rounded-2xl px-4 py-3.5 text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: 'var(--accent)' }}
        >
          <span>Send USDC</span>
          <ArrowUpRight className="size-4" />
        </button>
        <a
          href="https://explorer.testnet.arc.io"
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-between rounded-2xl px-4 py-3.5 text-sm font-semibold transition-all hover:scale-[1.01] active:scale-[0.99]"
          style={{ background: 'var(--surface-muted)', color: 'var(--ink-2)', border: '1px solid var(--border)' }}
        >
          <span>Explorer</span>
          <ExternalLink className="size-4" />
        </a>
      </div>

      {/* Transaction history */}
      {txHistory.length > 0 && (
        <section className="w-full max-w-md p-4" style={glass.card}>
          <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: 'var(--muted)' }}>
            Recent Sends
          </p>
          <ul className="space-y-2">
            {txHistory.map((record) => (
              <li key={record.hash} className="flex items-center justify-between rounded-xl px-3 py-2.5" style={glass.inner}>
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="size-4 shrink-0" style={{ color: 'var(--success)' }} />
                  <div>
                    <p className="text-xs font-medium mono" style={{ color: 'var(--ink)' }}>
                      {formatAddress(record.to)}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>
                      {new Date(record.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
                    {record.amount} USDC
                  </span>
                  <a
                    href={buildTxExplorerUrl(ARC_TESTNET_CHAIN_ID, record.hash)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ChevronRight className="size-4" style={{ color: 'var(--subtle)' }} />
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Testnet note */}
      <p className="mt-6 text-xs text-center max-w-xs" style={{ color: 'var(--subtle)' }}>
        Running on Arc Testnet. Use the &ldquo;Get test USDC&rdquo; button in the sidebar to fund your wallet.
      </p>

      {/* Send sheet */}
      <AnimatePresence>
        {sheetOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-end justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => { if (!isPending && !isConfirming) setSheetOpen(false) }}
          >
            <div className="absolute inset-0 bg-black/25 backdrop-blur-sm" />
            <motion.section
              className="relative w-full max-w-md overflow-hidden rounded-t-3xl"
              style={{
                background: 'rgba(255,255,255,0.92)',
                backdropFilter: 'blur(40px) saturate(200%)',
                WebkitBackdropFilter: 'blur(40px) saturate(200%)',
              }}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Spectral strip */}
              <div className="h-1" style={{ background: spectral }} />

              {/* Drag handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="h-1 w-10 rounded-full bg-black/10" />
              </div>

              <div className="px-5 pb-8 pt-3">
                {/* Sheet header */}
                <div className="flex items-center justify-between mb-5">
                  <h2 className="display text-lg font-semibold" style={{ color: 'var(--ink)' }}>
                    Send USDC
                  </h2>
                  <button
                    onClick={() => { if (!isPending && !isConfirming) { handleReset() } }}
                    className="flex size-8 items-center justify-center rounded-full"
                    style={{ background: 'var(--surface-muted)' }}
                  >
                    <X className="size-4" style={{ color: 'var(--muted)' }} />
                  </button>
                </div>

                {isSuccess ? (
                  /* Success state */
                  <div className="text-center py-4">
                    <CheckCircle2 className="size-12 mx-auto mb-3" style={{ color: 'var(--success)' }} />
                    <p className="display text-xl font-semibold mb-1" style={{ color: 'var(--ink)' }}>
                      Sent!
                    </p>
                    <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>
                      {amount} USDC sent to {formatAddress(recipient)}
                    </p>
                    {txUrl && (
                      <a
                        href={txUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-medium mb-5"
                        style={{ color: 'var(--accent-hover)' }}
                      >
                        View on ArcScan <ExternalLink className="size-3" />
                      </a>
                    )}
                    <button
                      onClick={handleReset}
                      className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white"
                      style={{ background: 'var(--accent)' }}
                    >
                      Send Again
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Recipient */}
                    <div className="mb-3">
                      <label className="text-xs font-semibold tracking-wide uppercase mb-1.5 block" style={{ color: 'var(--muted)' }}>
                        Recipient
                      </label>
                      <div className="rounded-2xl px-4 py-3" style={glass.inner}>
                        <input
                          type="text"
                          value={recipient}
                          onChange={(e) => setRecipient(e.target.value.trim())}
                          placeholder="0x… wallet address"
                          className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400 mono"
                          style={{ color: 'var(--ink)' }}
                          spellCheck={false}
                        />
                      </div>
                      {recipient && !recipientValid && (
                        <p className="text-xs mt-1 flex items-center gap-1" style={{ color: 'var(--danger)' }}>
                          <AlertCircle className="size-3" /> Invalid address
                        </p>
                      )}
                    </div>

                    {/* Amount */}
                    <div className="mb-3">
                      <label className="text-xs font-semibold tracking-wide uppercase mb-1.5 block" style={{ color: 'var(--muted)' }}>
                        Amount
                      </label>
                      <div className="rounded-2xl px-4 py-3" style={glass.inner}>
                        <input
                          inputMode="decimal"
                          type="text"
                          value={amount}
                          onChange={(e) => {
                            const v = e.target.value.replace(/[^0-9.]/g, '')
                            if (v === '' || /^\d*\.?\d*$/.test(v)) setAmount(v)
                          }}
                          placeholder="0.00"
                          className="display w-full bg-transparent text-3xl font-bold tabular-nums outline-none placeholder:text-slate-300"
                          style={{ color: 'var(--ink)' }}
                        />
                        <div className="mt-1.5 flex items-center justify-between">
                          <span className="text-xs" style={{ color: 'var(--subtle)' }}>USDC</span>
                          {formattedBalance && (
                            <button
                              onClick={() => setAmount(formattedBalance)}
                              className="text-xs font-semibold"
                              style={{ color: 'var(--accent-hover)' }}
                            >
                              Balance: {formattedBalance} · Max
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Quick amounts */}
                      <div className="flex gap-2 mt-2">
                        {QUICK_AMOUNTS.map((q) => (
                          <button
                            key={q}
                            onClick={() => setAmount(q)}
                            className="flex-1 rounded-xl py-1.5 text-xs font-semibold transition-all hover:scale-[1.03] active:scale-[0.97]"
                            style={{
                              background: amount === q ? 'var(--accent)' : 'var(--surface-muted)',
                              color: amount === q ? '#fff' : 'var(--ink-2)',
                              border: '1px solid var(--border)',
                            }}
                          >
                            ${q}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Memo */}
                    <div className="mb-4">
                      <label className="text-xs font-semibold tracking-wide uppercase mb-1.5 block" style={{ color: 'var(--muted)' }}>
                        Memo <span style={{ color: 'var(--subtle)', textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
                      </label>
                      <div className="rounded-2xl px-4 py-3" style={glass.inner}>
                        <input
                          type="text"
                          value={memo}
                          onChange={(e) => setMemo(e.target.value)}
                          placeholder="What's it for?"
                          maxLength={64}
                          className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
                          style={{ color: 'var(--ink)' }}
                        />
                      </div>
                    </div>

                    {/* Error */}
                    {errorMsg && (
                      <div
                        className="flex items-center gap-2 rounded-xl px-3 py-2 mb-3 text-xs font-medium"
                        style={{ background: 'rgba(186,43,76,0.08)', color: 'var(--danger)' }}
                      >
                        <AlertCircle className="size-4 shrink-0" />
                        {errorMsg}
                      </div>
                    )}

                    {/* Preview row */}
                    {recipientValid && amountValid && (
                      <div className="rounded-xl px-3 py-2.5 mb-3 flex items-center justify-between" style={glass.inner}>
                        <span className="text-xs" style={{ color: 'var(--muted)' }}>You send</span>
                        <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--ink)' }}>
                          {amount} USDC
                        </span>
                      </div>
                    )}

                    {/* CTA */}
                    <button
                      disabled={!canSend}
                      onClick={handleSend}
                      className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
                      style={{ background: 'var(--accent)' }}
                    >
                      {isPending ? (
                        <span className="flex items-center justify-center gap-2">
                          <Loader2 className="size-4 animate-spin" /> Confirm in wallet…
                        </span>
                      ) : isConfirming ? (
                        <span className="flex items-center justify-center gap-2">
                          <Loader2 className="size-4 animate-spin" /> Confirming…
                        </span>
                      ) : wrongChain ? (
                        'Switch to Arc Testnet'
                      ) : !isConnected ? (
                        'Connect Wallet'
                      ) : (
                        'Send USDC'
                      )}
                    </button>
                  </>
                )}
              </div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
