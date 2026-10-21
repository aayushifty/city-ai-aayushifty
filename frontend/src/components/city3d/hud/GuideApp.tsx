import React, { useEffect, useState } from 'react';
import { api } from '../../../api/client';

/** Inline Markdown: **bold**, `code` and [links](url). */
function inline(text: string, key: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={`${key}-${i}`} className="text-white">{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={`${key}-${i}`} className="px-1 rounded bg-white/10 text-amber-200 text-[10px] break-all">{part.slice(1, -1)}</code>;
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) return <a key={`${key}-${i}`} href={link[2]} target="_blank" rel="noreferrer" className="text-cyan-300 underline">{link[1]}</a>;
    return <React.Fragment key={`${key}-${i}`}>{part}</React.Fragment>;
  });
}

/** Just enough Markdown for the guide: headings, paragraphs, lists, numbered lists and tables. */
export const Markdown: React.FC<{ source: string }> = ({ source }) => {
  const out: React.ReactNode[] = [];
  const lines = source.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (line.startsWith('#')) {
      const level = line.match(/^#+/)![0].length;
      const text = line.replace(/^#+\s*/, '');
      out.push(level === 1
        ? <div key={i} className="text-[14px] font-extrabold text-amber-300 mb-1">{text}</div>
        : <div key={i} className="text-[12px] font-bold text-slate-50 mt-3 mb-1">{inline(text, `h${i}`)}</div>);
      i++;
    } else if (line.startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        if (!/^\|[\s:|-]+\|$/.test(lines[i].trim())) rows.push(lines[i].split('|').slice(1, -1).map(c => c.trim()));
        i++;
      }
      out.push(
        <table key={`t${i}`} className="w-full text-[10.5px] my-1 border-collapse">
          <tbody>{rows.map((r, ri) => (
            <tr key={ri} className={ri === 0 ? 'text-slate-400' : 'border-t border-white/5'}>
              {r.map((c, ci) => <td key={ci} className={`py-0.5 pr-2 align-top ${ci === 0 && ri > 0 ? 'text-amber-200 whitespace-nowrap' : 'text-slate-300'}`}>{inline(c, `c${ri}${ci}`)}</td>)}
            </tr>
          ))}</tbody>
        </table>);
    } else if (/^(\s*[-*]|\s*\d+\.)\s/.test(line)) {
      const items: string[] = [];
      const ordered = /^\s*\d+\./.test(line);
      while (i < lines.length && /^(\s*[-*]|\s*\d+\.)\s/.test(lines[i])) {
        items.push(lines[i].replace(/^(\s*[-*]|\s*\d+\.)\s/, ''));
        i++;
      }
      const List = ordered ? 'ol' : 'ul';
      out.push(
        <List key={`l${i}`} className={`${ordered ? 'list-decimal' : 'list-disc'} pl-4 space-y-0.5 text-[11px] text-slate-300 leading-snug`}>
          {items.map((t, k) => <li key={k}>{inline(t, `li${i}${k}`)}</li>)}
        </List>);
    } else {
      out.push(<p key={i} className="text-[11px] text-slate-300 leading-snug my-1">{inline(line, `p${i}`)}</p>);
      i++;
    }
  }
  return <div>{out}</div>;
};

/** Phone app: the user guide (docs/USER_GUIDE.md, served by the backend). */
export const GuideApp: React.FC = () => {
  const [md, setMd] = useState<string | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    api.getGuide().then(setMd).catch(() => setError(true));
  }, []);
  if (error) return <div className="text-[11px] text-red-300 text-center p-3">The guide could not be loaded (backend offline).</div>;
  if (md === null) return <div className="text-[11px] text-slate-400 text-center p-3">Loading…</div>;
  return <Markdown source={md} />;
};
