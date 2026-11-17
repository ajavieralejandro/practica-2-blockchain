import React, { useState } from 'react';
import { X, Scissors, CheckCircle2, ExternalLink, FileCode2, ArrowRight } from 'lucide-react';
import { PaymentRecord } from '../types/payment';
import { getIpfsGatewayUrl } from '../services/ipfsService';

interface SplitApproveModalProps {
  payment: PaymentRecord | null;
  onClose: () => void;
  onConfirmSplit: (paymentId: string, amountEth: string, deliverableCID: string) => Promise<void>;
}

export const SplitApproveModal: React.FC<SplitApproveModalProps> = ({
  payment,
  onClose,
  onConfirmSplit,
}) => {
  if (!payment) return null;

  const totalEthNum = parseFloat(payment.amountEth) || 0;
  const [splitEth, setSplitEth] = useState<string>(payment.amountEth);
  const [deliverableCid] = useState<string>(
    payment.deliverableCID || payment.agreementCID
  );
  const [submitting, setSubmitting] = useState<boolean>(false);

  const parsedSplit = parseFloat(splitEth) || 0;
  const remainingEth = Math.max(0, totalEthNum - parsedSplit);

  const applyPreset = (ratio: number) => {
    const val = (totalEthNum * ratio).toFixed(4).replace(/\.?0+$/, '');
    setSplitEth(val);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (parsedSplit <= 0 || parsedSplit > totalEthNum) return;
    setSubmitting(true);
    try {
      await onConfirmSplit(payment.id, splitEth, deliverableCid);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
              <Scissors className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                Aprobar Hito y Dividir Pago (splitAndApproveMilestone)
              </h3>
              <p className="font-mono text-xs text-slate-400">
                Token ERC-721 {payment.shortId} · Saldo Restante: {payment.amountEth} ETH
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-3.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                <FileCode2 className="h-3.5 w-3.5 text-sky-400" />
                Entregable del Proveedor (deliverableCID en contrato)
              </span>
              {deliverableCid && (
                <a
                  href={getIpfsGatewayUrl(deliverableCid)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400 hover:underline"
                >
                  <span>Inspeccionar en Gateway :8080</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
            <div className="mt-2 truncate rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 font-mono text-xs text-slate-300">
              {payment.deliverableCID || 'Sin deliverableCID adjunto en el contrato'}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Monto a recortar y pagar (msg.value en ETH)
              </label>
              <div className="flex items-center gap-1">
                {[
                  { label: '25%', ratio: 0.25 },
                  { label: '40%', ratio: 0.4 },
                  { label: '50%', ratio: 0.5 },
                  { label: '100% Total', ratio: 1 },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => applyPreset(preset.ratio)}
                    className="rounded border border-slate-700 bg-slate-800 px-2 py-0.5 font-mono text-[11px] text-slate-300 hover:border-emerald-500/50 hover:text-emerald-300"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-2 flex items-center gap-2">
              <input
                type="number"
                step="0.0001"
                min="0.0001"
                max={payment.amountEth}
                required
                value={splitEth}
                onChange={(e) => setSplitEth(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 font-mono text-sm text-white focus:border-emerald-500 focus:outline-none"
              />
              <span className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-xs font-semibold text-emerald-400">
                ETH
              </span>
            </div>
            <p className="mt-1.5 text-[11px] text-slate-400">
              El contrato <code className="font-mono text-emerald-400">splitAndApproveMilestone(_paymentId)</code> es{' '}
              <code className="font-mono text-emerald-400">payable</code>: usa <code className="font-mono">msg.value</code> para recortar el sub-pago, fondearlo con <code className="font-mono">pay(newId)</code> y marcarlo como <code className="font-mono">approved = true</code>.
            </p>
          </div>

          <div className="grid grid-cols-3 items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/90 p-3 text-center">
            <div>
              <div className="text-[11px] text-slate-400">Nuevo Hito (newId)</div>
              <div className="font-mono text-sm font-bold text-emerald-400">
                {parsedSplit.toFixed(4).replace(/\.?0+$/, '') || '0'} ETH
              </div>
              <div className="text-[10px] text-emerald-500">Fondeado &amp; Aprobado</div>
            </div>
            <div className="flex justify-center text-slate-600">
              <ArrowRight className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[11px] text-slate-400">Restante en Principal</div>
              <div className="font-mono text-sm font-bold text-slate-200">
                {remainingEth.toFixed(4).replace(/\.?0+$/, '') || '0'} ETH
              </div>
              <div className="text-[10px] text-slate-400">deliverableCID se limpia</div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || parsedSplit <= 0 || parsedSplit > totalEthNum}
              className="flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 shadow-sm transition hover:bg-emerald-400 disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>
                {submitting
                  ? 'Firmando en MetaMask...'
                  : `Dividir y Pagar Hito (${splitEth} ETH)`}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
