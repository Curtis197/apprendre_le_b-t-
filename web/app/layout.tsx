// web/app/layout.tsx
import type { Metadata } from 'next'
import { Inter, Lexend } from 'next/font/google'
import './globals.css'
import { Navbar } from '@/components/Navbar'
import { DialectProvider } from '@/context/DialectContext'
import { HydrationProbe } from '@/components/HydrationProbe'

// TEMP iOS DIAGNOSTIC — remove this whole block (and <HydrationProbe/> + the <script/> below) once the iOS issue is fixed.
const IOS_DIAG = `
(function(){
  try {
    var log = [];
    function render(){
      try {
        var el = document.getElementById('ios-diag');
        if (!el) {
          if (!document.body) return;
          el = document.createElement('div');
          el.id = 'ios-diag';
          el.setAttribute('style','position:fixed;left:0;right:0;bottom:0;z-index:2147483647;max-height:45vh;overflow:auto;background:#111;color:#0f0;font:11px/1.45 monospace;padding:8px;white-space:pre-wrap;border-top:2px solid #0f0;-webkit-overflow-scrolling:touch;');
          var btn = document.createElement('button');
          btn.textContent = 'hide';
          btn.setAttribute('style','position:absolute;top:4px;right:4px;background:#0f0;color:#111;border:0;padding:2px 8px;font:11px monospace;');
          btn.onclick = function(){ el.style.display='none'; };
          el.appendChild(btn);
          document.body.appendChild(el);
        }
        var pre = el.querySelector('pre') || (function(){ var p=document.createElement('pre'); p.style.margin='0'; el.appendChild(p); return p; })();
        pre.textContent = log.join('\\n');
      } catch(e){}
    }
    function add(line){ log.push(line); render(); }
    window.addEventListener('error', function(e){
      add('JS ERROR: ' + (e.message || e.type) + ' @ ' + (e.filename||'') + ':' + (e.lineno||'') + ':' + (e.colno||''));
    });
    window.addEventListener('unhandledrejection', function(e){
      var r = e && e.reason; add('PROMISE REJECT: ' + (r && r.message ? r.message : String(r)));
    });
    window.__iosDiagHydrated = function(){ add('REACT HYDRATED: yes'); };
    function sup(prop, val){ try { return (window.CSS && CSS.supports) ? (CSS.supports(prop, val) ? 'YES' : 'no') : '?'; } catch(e){ return 'err'; } }
    function start(){
      add('UA: ' + navigator.userAgent);
      add('color-mix(oklab): ' + sup('color','color-mix(in oklab, red, blue)'));
      add('color-mix(srgb): ' + sup('color','color-mix(in srgb, red, blue)'));
      add('oklch(): ' + sup('color','oklch(0.5 0.1 30)'));
      add('backdrop-filter: ' + sup('backdrop-filter','blur(4px)'));
      var prop='?'; try { prop = (window.CSS && CSS.registerProperty) ? 'YES' : 'NO'; } catch(e){ prop='err'; }
      add('@property (registerProperty): ' + prop);
      setTimeout(function(){
        add('hydrated after 4s: ' + (document.documentElement.getAttribute('data-hydrated') || 'NO — React did not hydrate'));
      }, 4000);
    }
    if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
  } catch(e) {
    try { var d=document.createElement('div'); d.textContent='diag crashed: '+(e&&e.message?e.message:e); d.setAttribute('style','position:fixed;bottom:0;left:0;right:0;background:red;color:#fff;z-index:2147483647;padding:6px;font:12px monospace'); (document.body||document.documentElement).appendChild(d);}catch(_){}
  }
})();
`

const inter  = Inter({ subsets: ['latin'], variable: '--font-inter' })
const lexend = Lexend({ subsets: ['latin'], variable: '--font-lexend', weight: ['400', '600', '700'] })

export const metadata: Metadata = {
  title: 'Apprendre le bhété — Plateforme linguistique',
  description: 'Lexique, traducteur et ressources pour la langue bhété'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className={`${inter.variable} ${lexend.variable}`}>
        {/* TEMP iOS DIAGNOSTIC — remove once fixed */}
        <script dangerouslySetInnerHTML={{ __html: IOS_DIAG }} />
        <HydrationProbe />
        <Navbar />
        <DialectProvider>
          <main>{children}</main>
        </DialectProvider>
      </body>
    </html>
  )
}
