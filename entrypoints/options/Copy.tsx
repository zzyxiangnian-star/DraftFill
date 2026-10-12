import { Check, ClipboardCopy } from 'lucide-react';
import { useState } from 'react';
import { iconProps } from '@/src/components/icon';

export function Copy({ text, label = '复制', onCopied }: { text: string; label?: string; onCopied?: () => void }) {
  const [done, setDone] = useState(false);
  return (
    <button className="btn btn-text small" onClick={async () => { await navigator.clipboard.writeText(text); onCopied?.(); setDone(true); setTimeout(() => setDone(false), 1500); }}>
      {done ? <Check {...iconProps} /> : <ClipboardCopy {...iconProps} />} {done ? '已复制' : label}</button>
  );
}
