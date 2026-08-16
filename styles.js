/* نظام التصميم لنقطة البيع — RTL، وضعان (فاتح/داكن)، وأربع هويّات لونية */
export const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&family=Cairo:wght@600;700;800&family=IBM+Plex+Mono:wght@500;600&display=swap');

:root{
  --ink:#17130F; --ink2:#201A15; --ink3:#2A231C; --line:#3A3126;
  --txt:#F3ECE0; --dim:#B4A794; --faint:#7C6F5E;
  --acc:#C8A24A; --acc-d:#8C6F2C; --acc-l:#EBCB80;
  --mint:#4FB286; --rose:#DA5A53; --amber:#E0A458; --sky:#5B93C4; --violet:#9B7BB8;
  --s1:4px; --s2:8px; --s3:12px; --s4:16px; --s5:20px; --s6:24px; --s8:32px;
  --r-sm:8px; --r:12px; --r-md:16px; --r-lg:20px; --r-full:999px;
  --sh-1:0 1px 2px rgba(0,0,0,.28); --sh-2:0 3px 12px rgba(0,0,0,.32);
  --sh-3:0 10px 30px rgba(0,0,0,.4); --sh-acc:0 8px 22px -8px rgba(200,162,74,.5);
  --ease:cubic-bezier(.4,0,.2,1); --ring:0 0 0 3px rgba(200,162,74,.32);
  --font:'Tajawal',system-ui,'Segoe UI',sans-serif; --font-h:'Cairo',sans-serif; --mono:'IBM Plex Mono',monospace;
}
*{box-sizing:border-box}
html,body,#root{margin:0;padding:0;height:100%;width:100%}
body{background:var(--ink)}

.pos{
  direction:rtl; background:var(--ink); color:var(--txt); min-height:100vh;
  font-family:var(--font); font-size:14px; line-height:1.6;
  -webkit-font-smoothing:antialiased; text-rendering:optimizeLegibility;
  --acc-soft:color-mix(in srgb,var(--acc) 13%,transparent);
  --acc-d:color-mix(in srgb,var(--acc) 74%,#000); --acc-l:color-mix(in srgb,var(--acc) 66%,#fff);
  --line-g:color-mix(in srgb,var(--acc) 24%,var(--line));
  --ring:0 0 0 3px color-mix(in srgb,var(--acc) 30%,transparent);
  --sh-acc:0 8px 22px -8px color-mix(in srgb,var(--acc) 46%,transparent);
}
/* الوضعان */
.pos.mode-dark{ --ink:#17130F; --ink2:#201A15; --ink3:#2A231C; --line:#3A3126; --txt:#F3ECE0; --dim:#B4A794; --faint:#7C6F5E;
  --sh-1:0 1px 2px rgba(0,0,0,.28); --sh-2:0 3px 12px rgba(0,0,0,.32); --sh-3:0 10px 30px rgba(0,0,0,.4); }
.pos.mode-light{ --ink:#F4F2ED; --ink2:#FFFFFF; --ink3:#ECE8E0; --line:#E2DCD1; --txt:#282320; --dim:#6A6157; --faint:#9A9186;
  --sh-1:0 1px 2px rgba(40,30,15,.06); --sh-2:0 3px 12px rgba(40,30,15,.09); --sh-3:0 12px 32px rgba(40,30,15,.14); }
/* الهويّات اللونية */
.pos.thm-brass{ --acc:#C8A24A; } .pos.thm-emerald{ --acc:#0F9D58; } .pos.thm-royal{ --acc:#7C5CBF; } .pos.thm-crimson{ --acc:#D5482E; }

.num{font-family:var(--mono);font-feature-settings:'tnum' 1}
button{font-family:inherit}
::-webkit-scrollbar{width:9px;height:9px}
::-webkit-scrollbar-thumb{background:var(--line-g);border-radius:99px}
::-webkit-scrollbar-track{background:transparent}

/* ═══════════ عناصر أساسية ═══════════ */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid var(--line-g);
  background:var(--ink2);color:var(--txt);border-radius:var(--r-sm);padding:9px 14px;font-size:13.5px;font-weight:600;
  cursor:pointer;transition:all .16s var(--ease);white-space:nowrap;box-shadow:var(--sh-1)}
.btn:hover:not(:disabled){border-color:var(--acc);background:var(--acc-soft);transform:translateY(-1px)}
.btn:active:not(:disabled){transform:translateY(0)}
.btn:disabled{opacity:.45;cursor:not-allowed}
.btn:focus-visible{outline:none;box-shadow:var(--ring)}
.btn.pri{background:linear-gradient(180deg,var(--acc-l),var(--acc));border-color:var(--acc-d);color:#1a1206;box-shadow:var(--sh-acc)}
.btn.pri:hover:not(:disabled){filter:brightness(1.05)}
.btn.ok{background:var(--mint);border-color:transparent;color:#04160e}
.btn.danger{background:var(--rose);border-color:transparent;color:#fff}
.btn.gh,.btn.ghost{background:transparent;box-shadow:none}
.btn.sm{padding:6px 10px;font-size:12.5px;border-radius:var(--r-sm)}
.btn.lg{padding:14px 18px;font-size:16px;font-weight:700}
.btn.block{width:100%}
.btn.icon{padding:8px;aspect-ratio:1}

.inp,.sel{width:100%;background:var(--ink);color:var(--txt);border:1px solid var(--line-g);border-radius:var(--r-sm);
  padding:10px 12px;font-size:14px;font-family:inherit;transition:all .15s var(--ease)}
.inp:focus,.sel:focus{outline:none;border-color:var(--acc);box-shadow:var(--ring)}
.inp::placeholder{color:var(--faint)}
.pos.mode-light .inp,.pos.mode-light .sel{background:var(--ink3)}
.fld{display:flex;flex-direction:column;gap:5px;margin-bottom:12px}
.lbl{font-size:12px;font-weight:600;color:var(--dim)}
textarea.inp{resize:vertical;min-height:60px}

.card{background:var(--ink2);border:1px solid var(--line);border-radius:var(--r-md);box-shadow:var(--sh-1)}
.card-p{padding:var(--s5)}
.card-t{display:flex;align-items:center;gap:8px;font-family:var(--font-h);font-weight:700;font-size:15px}
.card-h{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px var(--s5);border-bottom:1px solid var(--line)}

.badge{display:inline-flex;align-items:center;gap:4px;font-size:11.5px;font-weight:700;padding:2px 9px;border-radius:var(--r-full);
  background:var(--acc-soft);color:var(--acc-l);border:1px solid color-mix(in srgb,var(--acc) 26%,transparent)}
.badge.b-mint{background:color-mix(in srgb,var(--mint) 16%,transparent);color:var(--mint);border-color:color-mix(in srgb,var(--mint) 30%,transparent)}
.badge.b-rose{background:color-mix(in srgb,var(--rose) 16%,transparent);color:var(--rose);border-color:color-mix(in srgb,var(--rose) 30%,transparent)}
.badge.b-amber{background:color-mix(in srgb,var(--amber) 16%,transparent);color:var(--amber);border-color:color-mix(in srgb,var(--amber) 30%,transparent)}
.badge.b-sky{background:color-mix(in srgb,var(--sky) 16%,transparent);color:var(--sky);border-color:color-mix(in srgb,var(--sky) 30%,transparent)}
.badge.b-dim{background:var(--ink3);color:var(--dim);border-color:var(--line)}

/* شريط مقسّم (Segmented) */
.seg{display:inline-flex;background:var(--ink);border:1px solid var(--line-g);border-radius:var(--r-sm);padding:3px;gap:3px;flex-wrap:wrap}
.seg-b{display:inline-flex;align-items:center;gap:5px;border:none;background:transparent;color:var(--dim);
  padding:7px 13px;border-radius:calc(var(--r-sm) - 2px);font-size:13px;font-weight:600;cursor:pointer;transition:all .15s}
.seg-b:hover{color:var(--txt)}
.seg-b.on{background:var(--acc);color:#1a1206;box-shadow:var(--sh-1)}
.seg.pill .seg-b.on{background:var(--acc)}

.chip{display:inline-flex;align-items:center;gap:5px;padding:5px 11px;border-radius:var(--r-full);background:var(--ink3);
  border:1px solid var(--line);font-size:12.5px;font-weight:600;color:var(--dim);cursor:pointer;transition:all .15s}
.chip.on{background:var(--acc-soft);color:var(--acc-l);border-color:var(--acc)}

.kpi{background:var(--ink2);border:1px solid var(--line);border-radius:var(--r-md);padding:16px 18px;position:relative;overflow:hidden;box-shadow:var(--sh-1)}
.kpi::before{content:'';position:absolute;inset-inline-start:0;top:0;bottom:0;width:3px;background:var(--acc)}
.kpi-l{font-size:12px;color:var(--dim);font-weight:600;display:flex;align-items:center;gap:6px}
.kpi-v{font-size:24px;font-weight:800;margin-top:6px;font-family:var(--mono)}
.kpi-s{font-size:11.5px;color:var(--faint);margin-top:2px}

.empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:48px 20px;color:var(--faint);text-align:center}
.empty svg{opacity:.5}

/* ═══════════ الهيكل العام ═══════════ */
.app{display:grid;grid-template-columns:76px 1fr;height:100vh;overflow:hidden}
.side{background:var(--ink2);border-inline-end:1px solid var(--line);display:flex;flex-direction:column;align-items:center;padding:12px 0;gap:4px;overflow-y:auto}
.side-logo{width:46px;height:46px;border-radius:14px;background:linear-gradient(150deg,var(--acc-l),var(--acc-d));display:flex;align-items:center;justify-content:center;color:#1a1206;font-weight:800;font-size:20px;margin-bottom:10px;box-shadow:var(--sh-acc)}
.nav{display:flex;flex-direction:column;gap:4px;width:100%;align-items:center;flex:1}
.navbtn{width:60px;height:58px;border:none;background:transparent;color:var(--dim);border-radius:14px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;cursor:pointer;transition:all .16s;font-size:10px;font-weight:600;position:relative}
.navbtn:hover{background:var(--acc-soft);color:var(--txt)}
.navbtn.on{background:var(--acc-soft);color:var(--acc-l)}
.navbtn.on::before{content:'';position:absolute;inset-inline-start:0;top:14px;bottom:14px;width:3px;border-radius:99px;background:var(--acc)}
.navbtn .nb-dot{position:absolute;top:9px;inset-inline-end:12px;min-width:16px;height:16px;padding:0 4px;border-radius:99px;background:var(--rose);color:#fff;font-size:10px;display:flex;align-items:center;justify-content:center;font-weight:700}
.side-foot{display:flex;flex-direction:column;gap:4px;align-items:center;width:100%}

.main{display:flex;flex-direction:column;overflow:hidden;min-width:0}
.topbar{height:60px;flex:none;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 20px;border-bottom:1px solid var(--line);background:var(--ink2)}
.tb-title{font-family:var(--font-h);font-weight:800;font-size:18px;display:flex;align-items:center;gap:9px}
.tb-actions{display:flex;align-items:center;gap:8px}
.tb-user{display:flex;align-items:center;gap:8px;padding:5px 6px 5px 12px;background:var(--ink);border:1px solid var(--line-g);border-radius:var(--r-full);cursor:pointer}
.tb-ava{width:30px;height:30px;border-radius:99px;background:var(--acc);color:#1a1206;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px}
.mode-pill{display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--dim);padding:4px 9px;border-radius:99px;border:1px solid var(--line);background:var(--ink)}
.mode-pill .dot{width:7px;height:7px;border-radius:99px;background:var(--mint)}
.mode-pill.off .dot{background:var(--faint)}

.screen{flex:1;overflow-y:auto;min-height:0}
.screen-pad{padding:20px}
.h-row{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;flex-wrap:wrap}
.h-ttl{font-family:var(--font-h);font-weight:700;font-size:17px}
.grid-kpi{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin-bottom:16px}

/* ═══════════ شاشة البيع ═══════════ */
.pos-wrap{display:grid;grid-template-columns:1fr 400px;height:100%;overflow:hidden}
.menu-col{display:flex;flex-direction:column;overflow:hidden;border-inline-end:1px solid var(--line)}
.menu-top{padding:12px 16px;border-bottom:1px solid var(--line);display:flex;gap:10px;align-items:center}
.search{flex:1;position:relative}
.search .inp{padding-inline-start:36px}
.search svg{position:absolute;inset-inline-start:11px;top:50%;transform:translateY(-50%);color:var(--faint)}
.cat-rail{display:flex;gap:8px;padding:12px 16px;overflow-x:auto;border-bottom:1px solid var(--line);flex:none}
.cat{flex:none;min-width:88px;padding:10px 12px;border-radius:var(--r);border:1px solid var(--line-g);background:var(--ink2);cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:4px;transition:all .16s}
.cat:hover{border-color:var(--acc);transform:translateY(-2px)}
.cat.on{background:var(--acc-soft);border-color:var(--acc)}
.cat-emoji{font-size:22px;line-height:1}
.cat-name{font-size:12px;font-weight:600;white-space:nowrap}
.cat-cnt{font-size:10px;color:var(--faint)}
.item-grid{flex:1;overflow-y:auto;padding:16px;display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px;align-content:start}
.item{background:var(--ink2);border:1px solid var(--line);border-radius:var(--r-md);padding:14px 12px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:7px;text-align:center;transition:all .16s;position:relative;box-shadow:var(--sh-1);min-height:128px;justify-content:center}
.item:hover{border-color:var(--acc);transform:translateY(-3px);box-shadow:var(--sh-2)}
.item:active{transform:translateY(-1px)}
.item-emoji{font-size:34px;line-height:1}
.item-name{font-size:13px;font-weight:700;line-height:1.35}
.item-price{font-size:13px;font-weight:800;color:var(--acc-l);font-family:var(--mono)}
.item-mods-hint{position:absolute;top:8px;inset-inline-start:8px;color:var(--faint)}
.item.out{opacity:.45;filter:grayscale(.6)}
.item.out::after{content:'غير متوفر';position:absolute;bottom:8px;font-size:10px;color:var(--rose);font-weight:700}

/* السلة */
.cart-col{display:flex;flex-direction:column;background:var(--ink2);overflow:hidden}
.cart-head{padding:12px 16px;border-bottom:1px solid var(--line);display:flex;flex-direction:column;gap:10px;flex:none}
.cart-title{display:flex;align-items:center;justify-content:space-between;gap:8px}
.cart-title b{font-family:var(--font-h);font-size:15px}
.cart-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.cart-lines{flex:1;overflow-y:auto;padding:8px 12px}
.line{display:flex;gap:10px;padding:10px 6px;border-bottom:1px solid var(--line);align-items:flex-start}
.line-main{flex:1;min-width:0}
.line-name{font-weight:700;font-size:13.5px}
.line-mods{font-size:11px;color:var(--dim);margin-top:2px}
.line-note{font-size:11px;color:var(--amber);margin-top:2px}
.line-sent{font-size:10px;color:var(--mint);margin-top:2px;display:inline-flex;align-items:center;gap:3px}
.line-price{font-family:var(--mono);font-weight:700;font-size:13.5px;white-space:nowrap}
.stepper{display:inline-flex;align-items:center;gap:2px;background:var(--ink);border:1px solid var(--line-g);border-radius:var(--r-full);padding:2px}
.stepper button{width:26px;height:26px;border:none;background:transparent;color:var(--txt);cursor:pointer;border-radius:99px;display:flex;align-items:center;justify-content:center}
.stepper button:hover{background:var(--acc-soft);color:var(--acc-l)}
.stepper .q{min-width:24px;text-align:center;font-weight:800;font-family:var(--mono);font-size:14px}
.cart-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:var(--faint);padding:30px}
.cart-foot{flex:none;border-top:1px solid var(--line);padding:12px 16px;background:var(--ink)}
.totrow{display:flex;justify-content:space-between;align-items:center;font-size:13px;padding:3px 0;color:var(--dim)}
.totrow .v{font-family:var(--mono);color:var(--txt)}
.totrow.grand{font-size:19px;font-weight:800;color:var(--txt);border-top:1px dashed var(--line-g);margin-top:6px;padding-top:9px}
.totrow.grand .v{color:var(--acc-l);font-weight:800}
.cart-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}
.cart-actions .pay{grid-column:1/-1}

/* ═══════════ الطاولات ═══════════ */
.zone-h{font-family:var(--font-h);font-weight:700;font-size:15px;margin:18px 0 10px;display:flex;align-items:center;gap:8px}
.tables-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:12px}
.tbl{background:var(--ink2);border:1px solid var(--line);border-radius:var(--r-md);padding:16px 12px;cursor:pointer;text-align:center;transition:all .16s;position:relative;box-shadow:var(--sh-1);min-height:112px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px}
.tbl:hover{border-color:var(--acc);transform:translateY(-3px)}
.tbl-ic{color:var(--dim)}
.tbl.busy{background:color-mix(in srgb,var(--amber) 12%,var(--ink2));border-color:color-mix(in srgb,var(--amber) 45%,transparent)}
.tbl.busy .tbl-ic{color:var(--amber)}
.tbl-name{font-weight:800;font-size:15px}
.tbl-seats{font-size:11px;color:var(--faint)}
.tbl-amt{font-family:var(--mono);font-weight:700;font-size:13px;color:var(--amber)}
.tbl-badge{position:absolute;top:8px;inset-inline-end:8px}

/* ═══════════ المطبخ (KDS) ═══════════ */
.kds-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px}
.ticket{background:var(--ink2);border:1px solid var(--line);border-radius:var(--r-md);overflow:hidden;box-shadow:var(--sh-1);display:flex;flex-direction:column}
.ticket.age-warn{border-color:color-mix(in srgb,var(--amber) 55%,transparent)}
.ticket.age-late{border-color:var(--rose);animation:pulse 2s infinite}
@keyframes pulse{50%{box-shadow:0 0 0 3px color-mix(in srgb,var(--rose) 22%,transparent)}}
.ticket-h{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:var(--ink3);border-bottom:1px solid var(--line)}
.ticket-no{font-weight:800;font-family:var(--font-h)}
.ticket-lines{padding:10px 12px;display:flex;flex-direction:column;gap:8px;flex:1}
.ticket-ln{display:flex;gap:8px;font-size:14px}
.ticket-ln .q{font-family:var(--mono);font-weight:800;color:var(--acc-l)}
.ticket-ln .mods{font-size:11px;color:var(--dim)}
.ticket-ln .note{font-size:11px;color:var(--amber);font-weight:700}
.ticket-foot{padding:10px 12px;border-top:1px solid var(--line);display:flex;gap:8px}

/* ═══════════ لوحة الأرقام والدفع ═══════════ */
.keypad{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.kp{padding:16px;font-size:20px;font-weight:700;font-family:var(--mono);background:var(--ink3);border:1px solid var(--line-g);border-radius:var(--r);color:var(--txt);cursor:pointer;transition:all .12s}
.kp:hover{background:var(--acc-soft);border-color:var(--acc)}
.kp:active{transform:scale(.96)}
.pay-amount{text-align:center;font-family:var(--mono);font-size:32px;font-weight:800;padding:14px;background:var(--ink);border-radius:var(--r);border:1px solid var(--line-g);margin-bottom:12px}
.pay-methods{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px}
.pay-m{padding:16px 8px;border-radius:var(--r);border:1px solid var(--line-g);background:var(--ink2);cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:6px;font-weight:700;font-size:13px;transition:all .16s}
.pay-m:hover{border-color:var(--acc);transform:translateY(-2px)}
.pay-m.on{background:var(--acc-soft);border-color:var(--acc);color:var(--acc-l)}
.quick-cash{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}
.pay-split-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;border:1px solid var(--line);border-radius:var(--r-sm);margin-bottom:6px}

/* رمز فاتورة والانتظار */
.fatora-wait{display:flex;flex-direction:column;align-items:center;gap:14px;padding:20px;text-align:center}
.fatora-qr{background:#fff;padding:12px;border-radius:var(--r);display:inline-block}
.spin{animation:spin 1s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}

/* ═══════════ النافذة (Modal) ═══════════ */
.mask{position:fixed;inset:0;background:rgba(0,0,0,.6);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:16px;z-index:100;animation:fade .18s}
@keyframes fade{from{opacity:0}}
.modal{background:var(--ink2);border:1px solid var(--line-g);border-radius:var(--r-lg);width:100%;max-width:520px;max-height:92vh;display:flex;flex-direction:column;box-shadow:var(--sh-3);animation:pop .2s var(--ease)}
@keyframes pop{from{transform:translateY(12px) scale(.98);opacity:0}}
.modal.wide{max-width:900px}
.modal-h{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:16px 20px;border-bottom:1px solid var(--line)}
.modal-h-t .card-t{font-size:16px}
.modal-h-s{font-size:12px;color:var(--dim);margin-top:2px}
.modal-b{padding:20px;overflow-y:auto}
.modal-f{padding:14px 20px;border-top:1px solid var(--line);display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap}

/* ═══════════ تسجيل الدخول ═══════════ */
.login{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;background:radial-gradient(900px 500px at 80% -10%,var(--acc-soft),transparent 60%),var(--ink)}
.login-card{background:var(--ink2);border:1px solid var(--line-g);border-radius:var(--r-lg);padding:28px;width:100%;max-width:400px;box-shadow:var(--sh-3);text-align:center}
.login-logo{width:64px;height:64px;border-radius:18px;background:linear-gradient(150deg,var(--acc-l),var(--acc-d));display:flex;align-items:center;justify-content:center;color:#1a1206;font-weight:800;font-size:30px;margin:0 auto 14px;box-shadow:var(--sh-acc)}
.users-row{display:flex;flex-direction:column;gap:8px;margin:16px 0}
.userbtn{display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid var(--line-g);border-radius:var(--r);background:var(--ink);cursor:pointer;transition:all .16s;text-align:right}
.userbtn:hover{border-color:var(--acc);background:var(--acc-soft)}
.userbtn.on{border-color:var(--acc);background:var(--acc-soft)}
.pin-dots{display:flex;gap:10px;justify-content:center;margin:16px 0}
.pin-dot{width:14px;height:14px;border-radius:99px;border:2px solid var(--line-g);transition:all .15s}
.pin-dot.f{background:var(--acc);border-color:var(--acc)}
.pin-pad{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;max-width:260px;margin:0 auto}

/* ═══════════ Toast ═══════════ */
.toast-wrap{position:fixed;bottom:22px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;gap:8px;z-index:300;align-items:center}
.toast{background:var(--ink3);border:1px solid var(--line-g);border-radius:var(--r);padding:11px 18px;font-size:13.5px;font-weight:600;box-shadow:var(--sh-3);display:flex;align-items:center;gap:8px;animation:pop .2s var(--ease)}
.toast.ok{border-color:var(--mint);color:var(--mint)}
.toast.no{border-color:var(--rose);color:var(--rose)}
.toast.warn{border-color:var(--amber);color:var(--amber)}

/* أدوات مساعدة */
.row{display:flex;gap:10px;align-items:center}
.row.wrap{flex-wrap:wrap}
.between{justify-content:space-between}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.spacer{flex:1}
.mut{color:var(--dim)}
.sm-txt{font-size:12px}
.mt{margin-top:12px}.mb{margin-bottom:12px}
table.tbl-list{width:100%;border-collapse:collapse;font-size:13px}
table.tbl-list th{text-align:right;color:var(--dim);font-weight:600;font-size:11.5px;padding:8px 10px;border-bottom:1px solid var(--line)}
table.tbl-list td{padding:9px 10px;border-bottom:1px solid var(--line)}
table.tbl-list tr:hover td{background:var(--acc-soft)}

/* استجابة الشاشات الصغيرة */
@media(max-width:920px){
  .pos-wrap{grid-template-columns:1fr}
  .cart-col{position:fixed;inset:0;z-index:80;display:none}
  .cart-col.open{display:flex}
  .app{grid-template-columns:64px 1fr}
}
@media(max-width:560px){
  .pay-methods{grid-template-columns:1fr}
  .grid2{grid-template-columns:1fr}
}
`;
