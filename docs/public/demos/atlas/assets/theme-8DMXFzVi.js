import{d as e,l as t}from"./props-yKVnIzL-.js";import{r as n}from"./h-CF_DQXyN.js";import{a as r,c as i,d as a,i as o,n as s,o as c,r as l,s as u,t as d}from"./src-CVKQW4OP.js";var f={extraStyles:void 0},p=new WeakMap,m=new l({maxEntries:256,lru:!0}),h=e=>{if(e===void 0)return f;if(typeof e==`string`){let t=m.get(e);return t||(t={extraStyles:e},m.set(e,t)),t}if(typeof e==`object`&&e||typeof e==`function`){let t=p.get(e);return t||(t={extraStyles:e},p.set(e,t)),t}return{extraStyles:e}},{styled:g,css:_,textComponent:v}=a,y=g(v,{layer:`elements`})`
  ${_`
    color: inherit;
    font-weight: inherit;
    line-height: 1;
  `};

  ${i({key:`$text`,styles:({css:e,theme:t})=>e`
  ${t.extraStyles&&c(t.extraStyles)};
`,css:_,normalize:!1})};
`,b=r=>{let[i,a]=e(r,[`paragraph`,`label`,`children`,`tag`,`css`,`ref`]),s=i.paragraph?`p`:i.tag,c=o(i,[`css`])?()=>({extraStyles:i.css}):h(i.css);return n(y,t(a,{ref:i.ref,as:s,$text:c,children:()=>i.children??i.label}))},x=`${r}/Text`,S=Object.assign(b,{displayName:x,pkgName:r,PYREON__COMPONENT:x,isText:!0}),C=d({useBooleans:!1}).withTheme(),w=C({name:`AtlasEl`,component:s}).attrs({contentAlignY:`top`}).styles(e=>e`
    ${({href:t,onClick:n,$rocketstyle:r,$rocketstate:a})=>{let o=n||t,{disabled:s,active:c,pseudo:l={}}=a??{},{hover:d,focus:f}=l,{hover:p,focus:m,active:h,disabled:g,..._}=r,v=i({theme:_,styles:u,css:e}),y=i({theme:p,styles:u,css:e}),b=i({theme:m,styles:u,css:e}),x=i({theme:h,styles:u,css:e}),S=i({theme:g,styles:u,css:e});return e`
        ${v};
        ${!s&&o&&e`
          cursor: pointer;
        `};
        ${!s&&e`
          &:hover {
            ${y};
          }
        `};
        ${d&&e`
          ${y};
        `};
        ${!s&&e`
          &:focus-visible {
            ${b};
          }
        `};
        ${f&&e`
          ${b};
        `};
        ${!s&&e`
          &:active {
            ${x};
          }
        `};
        ${!s&&c&&e`
          ${x};
        `};
        ${s&&e`
          ${S};
        `};
        &:disabled,
        &[aria-disabled='true'] {
          ${S};
        }
      `}}
  `),T=C({name:`AtlasTxt`,component:S}).styles(e=>e`
    ${({$rocketstyle:t})=>{let{hover:n,disabled:r,...a}=t;return e`
        ${i({theme:a,styles:u,css:e})};
        &:hover {
          ${i({theme:n,styles:u,css:e})};
        }
        &:disabled,
        &[aria-disabled='true'] {
          ${i({theme:r,styles:u,css:e})};
        }
      `}}
  `),E=e=>({extendCss:e}),D={font:{sans:`'Public Sans','Inter',system-ui,-apple-system,sans-serif`,display:`'Space Grotesk','Public Sans',system-ui,sans-serif`,mono:`'JetBrains Mono','SF Mono',ui-monospace,monospace`},size:{nano:`9px`,tag:`9.5px`,label:`10px`,meta:`10.5px`,caption:`11px`,small:`11.5px`,body:`12px`,text:`12.5px`,input:`13px`,item:`13.5px`,heading:`14px`,title:`15px`,hero:`16px`},tracking:{xs:`.02em`,sm:`.04em`,md:`.05em`,lg:`.06em`,xl:`.08em`,xxl:`.1em`},radius:{bar:`2px`,chip:`4px`,control:`4px`,item:`8px`,button:`8px`,field:`8px`,panel:`12px`,card:`12px`,modal:`16px`,stage:`16px`,pill:`20px`,round:`50%`},motion:{fast:`.1s`,base:`.12s`,slow:`.15s`}},O=[{id:`ember`,name:`Ember`,accent:`#ff6b3d`},{id:`aurora`,name:`Aurora`,accent:`#6d5efc`},{id:`forest`,name:`Forest`,accent:`#2f9e6f`},{id:`contrast`,name:`Contrast`,accent:`#141824`}];function k(e,t){let n=e.replace(`#`,``),r=n.length===3?n.split(``).map(e=>e+e).join(``):n;return`rgba(${parseInt(r.slice(0,2),16)},${parseInt(r.slice(2,4),16)},${parseInt(r.slice(4,6),16)},${t})`}var A=`#2f9e6f`,j=`#e0a53b`,M=`#e05b5b`;function N(e,t){let n=e.id===`contrast`?t?`#e6e7ec`:`#141824`:e.accent,r=e.id===`contrast`&&t?`#141824`:`#fff`;return t?{...D,hairline:`1px solid #26262f`,bg:`#0f0f14`,surface:`#16161d`,surface2:`#1c1c25`,chrome:`#17171f`,text:`#ececf0`,muted:`#8a8a99`,faint:`#55555f`,border:`#26262f`,accent:n,accent2:k(n,.7),accentSoft:k(n,.18),accentText:r,ok:A,okSoft:k(A,.18),warn:j,danger:M,dotColor:`rgba(120,128,150,.14)`,codeBg:`#0c0c11`,codeFg:`#c9c9d4`}:{...D,hairline:`1px solid #e6e8ee`,bg:`#ffffff`,surface:`#ffffff`,surface2:`#f6f7fa`,chrome:`#fafbfc`,text:`#17181c`,muted:`#697086`,faint:`#9aa0b0`,border:`#e6e8ee`,accent:n,accent2:k(n,.7),accentSoft:k(n,.12),accentText:r,ok:A,okSoft:k(A,.12),warn:j,danger:M,dotColor:`rgba(120,128,150,.16)`,codeBg:`#f6f7fa`,codeFg:`#3a3f4c`}}export{w as a,E as i,k as n,T as o,N as r,O as t};