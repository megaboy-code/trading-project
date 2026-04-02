import{_ as m}from"./index-DwMo9ngp.js";class u{constructor(e){var t,r;this.modal=null,this.isDragging=!1,this.dragOffsetX=0,this.dragOffsetY=0,this.item=e,this.fastColor=((t=e.values[0])==null?void 0:t.color)||"#00d394",this.slowColor=((r=e.values[1])==null?void 0:r.color)||"#ff4d6b"}open(){if(document.getElementById("strategy-settings-modal"))return;this.modal=document.createElement("div"),this.modal.id="strategy-settings-modal",this.modal.style.cssText=`
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: var(--bg-elevated);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border: 1px solid var(--border);
            border-radius: var(--radius-sm);
            padding: 0;
            width: 280px;
            box-shadow: var(--card-shadow);
            z-index: 10001;
            font-family: var(--text-sans);
            overflow: hidden;
        `,this.modal.appendChild(this.createHeader());const e=document.createElement("div");e.style.cssText="padding: 14px 16px;",e.appendChild(this.createNameLabel()),e.appendChild(this.createColorSection()),this.modal.appendChild(e),this.modal.appendChild(this.createFooter()),document.body.appendChild(this.modal),this.setupDragging(),this.setupCloseOnOutsideClick()}close(){this.modal&&document.body.contains(this.modal)&&document.body.removeChild(this.modal),this.modal=null}createHeader(){const e=document.createElement("div");e.style.cssText=`
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 11px 14px;
            background: var(--bg-card);
            border-bottom: 1px solid var(--border);
            cursor: grab;
            user-select: none;
            flex-shrink: 0;
        `;const t=document.createElement("div");t.style.cssText="display: flex; align-items: center; gap: 8px;";const r=document.createElement("i");r.className="fas fa-grip-vertical",r.style.cssText=`
            color: var(--text-muted);
            font-size: var(--text-base);
            flex-shrink: 0;
        `;const s=document.createElement("span");s.style.cssText=`
            font-size: var(--text-xl);
            font-weight: 600;
            color: var(--text-primary);
        `,s.textContent="Strategy Settings",t.appendChild(r),t.appendChild(s);const o=document.createElement("button");return o.style.cssText=`
            background: var(--bg-base);
            border: 1px solid var(--border);
            border-radius: var(--radius-xs);
            color: var(--text-muted);
            cursor: pointer;
            font-size: var(--text-xl);
            width: 26px;
            height: 26px;
            display: flex;
            align-items: center;
            justify-content: center;
            line-height: 1;
            transition: all 0.15s ease;
        `,o.innerHTML="&times;",o.addEventListener("mouseenter",()=>{o.style.background="rgba(var(--accent-sell-rgb), 0.1)",o.style.borderColor="var(--accent-sell)",o.style.color="var(--accent-sell)"}),o.addEventListener("mouseleave",()=>{o.style.background="var(--bg-base)",o.style.borderColor="var(--border)",o.style.color="var(--text-muted)"}),o.addEventListener("click",()=>this.close()),e.appendChild(t),e.appendChild(o),e}createNameLabel(){const e=document.createElement("div");e.style.cssText=`
            display: flex;
            align-items: center;
            gap: 6px;
            margin-bottom: 14px;
            font-size: var(--text-lg);
            color: var(--text-muted);
        `;const t=document.createElement("i");t.className="fas fa-robot",t.style.color=this.fastColor;const r=document.createElement("span");return r.textContent=this.item.name,e.appendChild(t),e.appendChild(r),e}createColorSection(){const e=document.createElement("div");return e.style.cssText=`
            display: flex;
            flex-direction: column;
            gap: 0;
        `,e.appendChild(this.createColorRow("Fast Line",this.fastColor,t=>{this.fastColor=t})),e.appendChild(this.createColorRow("Slow Line",this.slowColor,t=>{this.slowColor=t})),e}createColorRow(e,t,r){const s=document.createElement("div");s.style.cssText=`
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 7px 0;
            border-bottom: 1px solid var(--border-light);
        `;const o=document.createElement("span");o.style.cssText=`
            font-size: var(--text-lg);
            color: var(--text-secondary);
            font-weight: 500;
        `,o.textContent=e;const a=document.createElement("div");return a.style.cssText=`
            width: 32px;
            height: 24px;
            border-radius: var(--radius-xs);
            background-color: ${t};
            border: 1px solid var(--border);
            cursor: pointer;
            transition: border-color 0.15s ease;
        `,a.addEventListener("mouseenter",()=>{a.style.borderColor="var(--accent-info)"}),a.addEventListener("mouseleave",()=>{a.style.borderColor="var(--border)"}),a.addEventListener("click",async()=>{const{ColorPicker:n}=await m(async()=>{const{ColorPicker:d}=await import("./index-Ctv2f_o8.js");return{ColorPicker:d}},[]),i=this.parseToHexOpacity(t);new n({color:i.hex,opacity:i.opacity,onChange:(d,c)=>{const p=c<1?this.hexToRgba(d,c):d;a.style.backgroundColor=this.toDisplayColor(p),r(p)}}).open(a)}),s.appendChild(o),s.appendChild(a),s}createFooter(){const e=document.createElement("div");e.style.cssText=`
            display: flex;
            gap: 8px;
            padding: 10px 14px;
            border-top: 1px solid var(--border);
            background: var(--bg-card);
            flex-shrink: 0;
        `;const t=document.createElement("button");t.textContent="Cancel",t.style.cssText=`
            flex: 1;
            padding: 7px;
            background: var(--glass-gradient), var(--bg-elevated);
            border: 1px solid var(--border);
            border-radius: var(--radius-xs);
            color: var(--text-secondary);
            font-size: var(--text-lg);
            font-family: var(--text-sans);
            cursor: pointer;
            transition: all 0.15s ease;
        `,t.addEventListener("mouseenter",()=>{t.style.borderColor="var(--text-secondary)",t.style.color="var(--text-primary)"}),t.addEventListener("mouseleave",()=>{t.style.borderColor="var(--border)",t.style.color="var(--text-secondary)"}),t.addEventListener("click",()=>this.close());const r=document.createElement("button");return r.textContent="Apply",r.style.cssText=`
            flex: 1;
            padding: 7px;
            background: rgba(var(--accent-info-rgb), 0.1);
            border: 1px solid rgba(var(--accent-info-rgb), 0.3);
            border-radius: var(--radius-xs);
            color: var(--accent-info);
            font-size: var(--text-lg);
            font-weight: 600;
            font-family: var(--text-sans);
            cursor: pointer;
            transition: all 0.15s ease;
        `,r.addEventListener("mouseenter",()=>{r.style.background="rgba(var(--accent-info-rgb), 0.2)",r.style.borderColor="var(--accent-info)"}),r.addEventListener("mouseleave",()=>{r.style.background="rgba(var(--accent-info-rgb), 0.1)",r.style.borderColor="rgba(var(--accent-info-rgb), 0.3)"}),r.addEventListener("click",()=>{this.applySettings(),this.close()}),e.appendChild(t),e.appendChild(r),e}applySettings(){document.dispatchEvent(new CustomEvent("strategy-settings-changed",{detail:{strategyId:this.item.id,fastColor:this.fastColor,slowColor:this.slowColor}}))}setupDragging(){var t;const e=(t=this.modal)==null?void 0:t.querySelector("div");!e||!this.modal||(e.addEventListener("mousedown",r=>{r.preventDefault(),this.isDragging=!0;const s=this.modal.getBoundingClientRect();this.dragOffsetX=r.clientX-s.left,this.dragOffsetY=r.clientY-s.top,this.modal.style.transform="none",this.modal.style.cursor="grabbing",document.body.style.userSelect="none"}),document.addEventListener("mousemove",r=>{if(!this.isDragging||!this.modal)return;const s=r.clientX-this.dragOffsetX,o=r.clientY-this.dragOffsetY,a=window.innerWidth-this.modal.offsetWidth,n=window.innerHeight-this.modal.offsetHeight,i=Math.max(0,Math.min(s,a)),l=Math.max(0,Math.min(o,n));this.modal.style.left=`${i}px`,this.modal.style.top=`${l}px`}),document.addEventListener("mouseup",()=>{this.isDragging&&(this.isDragging=!1,this.modal.style.cursor="",document.body.style.userSelect="")}))}setupCloseOnOutsideClick(){setTimeout(()=>{const e=t=>{if(this.modal&&!this.modal.contains(t.target)){if(t.target.closest(".cp-container"))return;this.close(),document.removeEventListener("click",e)}};document.addEventListener("click",e)},100)}parseToHexOpacity(e){if(!e||typeof e!="string")return{hex:"#3b82f6",opacity:1};const t=e.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);if(t){const r=parseInt(t[1]),s=parseInt(t[2]),o=parseInt(t[3]),a=t[4]!==void 0?parseFloat(t[4]):1;return{hex:`#${r.toString(16).padStart(2,"0")}${s.toString(16).padStart(2,"0")}${o.toString(16).padStart(2,"0")}`,opacity:a}}return{hex:e.startsWith("#")?e:"#3b82f6",opacity:1}}hexToRgba(e,t){const r=e.replace("#",""),s=parseInt(r.substring(0,2),16),o=parseInt(r.substring(2,4),16),a=parseInt(r.substring(4,6),16);return`rgba(${s}, ${o}, ${a}, ${t})`}toDisplayColor(e){return e?this.parseToHexOpacity(e).hex:"#3b82f6"}}export{u as StrategySettingsModal};
