import{_ as p}from"./index-DwMo9ngp.js";const d=[{key:"lineWidth",label:"Line Width",type:"number",defaultValue:2,options:{min:1,max:5,step:1},validation:{min:1,max:5}},{key:"priceLineVisible",label:"Price Line",type:"checkbox",defaultValue:!0},{key:"lastValueVisible",label:"Last Value Label",type:"checkbox",defaultValue:!0},{key:"crosshairMarkerVisible",label:"Crosshair Marker",type:"checkbox",defaultValue:!0}],u={SMA:{name:"Simple Moving Average",fields:[{key:"period",label:"Period",type:"number",defaultValue:20,options:{min:1,max:200,step:1},validation:{min:1,max:200,required:!0}},{key:"source",label:"Source",type:"select",defaultValue:"close",options:["close","open","high","low","hl2","hlc3","ohlc4"]},...d]},EMA:{name:"Exponential Moving Average",fields:[{key:"period",label:"Period",type:"number",defaultValue:20,options:{min:1,max:200,step:1},validation:{min:1,max:200,required:!0}},{key:"source",label:"Source",type:"select",defaultValue:"close",options:["close","open","high","low","hl2","hlc3","ohlc4"]},...d]},RSI:{name:"Relative Strength Index",fields:[{key:"period",label:"Period",type:"number",defaultValue:14,options:{min:2,max:100,step:1},validation:{min:2,max:100,required:!0}},{key:"source",label:"Source",type:"select",defaultValue:"close",options:["close","open","high","low"]},{key:"overbought",label:"Overbought Level",type:"number",defaultValue:70,options:{min:50,max:100,step:1},validation:{min:50,max:100}},{key:"oversold",label:"Oversold Level",type:"number",defaultValue:30,options:{min:0,max:50,step:1},validation:{min:0,max:50}},...d]}};function h(c){return u[c]||null}class b{constructor(t){this.modal=null,this.settings={},this.isDragging=!1,this.dragOffsetX=0,this.dragOffsetY=0,this.item=t,this.color=t.color,this.settings=t.settings?{...t.settings}:this.extractSettingsFallback()}open(){if(document.getElementById("indicator-settings-modal"))return;const t=this.item.id.split("_")[0],r=h(t);this.modal=document.createElement("div"),this.modal.id="indicator-settings-modal",this.modal.style.cssText=`
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
            width: 320px;
            box-shadow: var(--card-shadow);
            z-index: 10001;
            font-family: var(--text-sans);
            overflow: hidden;
        `,this.modal.appendChild(this.createHeader((r==null?void 0:r.name)||this.item.name));const e=document.createElement("div");e.style.cssText="padding: 14px 16px;",e.appendChild(this.createColorRow()),r&&r.fields.forEach(o=>{const s=this.settings[o.key]??o.defaultValue;e.appendChild(this.createField(o,s))}),this.modal.appendChild(e),this.modal.appendChild(this.createFooter()),document.body.appendChild(this.modal),this.setupDragging(),this.setupCloseOnOutsideClick()}close(){this.modal&&document.body.contains(this.modal)&&document.body.removeChild(this.modal),this.modal=null}extractSettingsFallback(){const t=this.item.id.split("_"),r={};return t.length>=2&&(r.period=parseInt(t[1])||20),t.length>=3&&(r.source=t[2]||"close"),r}createHeader(t){const r=document.createElement("div");r.style.cssText=`
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 11px 14px;
            background: var(--bg-card);
            border-bottom: 1px solid var(--border);
            cursor: grab;
            user-select: none;
            flex-shrink: 0;
        `;const e=document.createElement("div");e.style.cssText="display: flex; align-items: center; gap: 8px;";const o=document.createElement("i");o.className="fas fa-grip-vertical",o.style.cssText=`
            color: var(--text-muted);
            font-size: var(--text-base);
            flex-shrink: 0;
        `;const s=document.createElement("span");s.style.cssText=`
            font-size: var(--text-xl);
            font-weight: 600;
            color: var(--text-primary);
        `,s.textContent=t,e.appendChild(o),e.appendChild(s);const n=document.createElement("button");return n.style.cssText=`
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
        `,n.innerHTML="&times;",n.addEventListener("mouseenter",()=>{n.style.background="rgba(var(--accent-sell-rgb), 0.1)",n.style.borderColor="var(--accent-sell)",n.style.color="var(--accent-sell)"}),n.addEventListener("mouseleave",()=>{n.style.background="var(--bg-base)",n.style.borderColor="var(--border)",n.style.color="var(--text-muted)"}),n.addEventListener("click",()=>this.close()),r.appendChild(e),r.appendChild(n),r}createColorRow(){const t=document.createElement("div");t.style.cssText=`
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 12px;
            padding: 7px 0;
            border-bottom: 1px solid var(--border-light);
        `;const r=document.createElement("span");r.style.cssText=`
            font-size: var(--text-lg);
            color: var(--text-secondary);
            font-weight: 500;
        `,r.textContent="Color";const e=document.createElement("div");return e.style.cssText=`
            width: 32px;
            height: 24px;
            border-radius: var(--radius-xs);
            background-color: ${this.color};
            border: 1px solid var(--border);
            cursor: pointer;
            transition: border-color 0.15s ease;
        `,e.addEventListener("mouseenter",()=>{e.style.borderColor="var(--accent-info)"}),e.addEventListener("mouseleave",()=>{e.style.borderColor="var(--border)"}),e.addEventListener("click",async()=>{const{ColorPicker:o}=await p(async()=>{const{ColorPicker:a}=await import("./index-Ctv2f_o8.js");return{ColorPicker:a}},[]),s=this.parseToHexOpacity(this.color);new o({color:s.hex,opacity:s.opacity,onChange:(a,i)=>{const l=i<1?this.hexToRgba(a,i):a;this.color=l,e.style.backgroundColor=this.toDisplayColor(l)}}).open(e)}),t.appendChild(r),t.appendChild(e),t}createField(t,r){const e=document.createElement("div");e.style.cssText=`
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 7px 0;
            border-bottom: 1px solid var(--border-light);
        `;const o=document.createElement("span");o.style.cssText=`
            font-size: var(--text-lg);
            color: var(--text-secondary);
            font-weight: 500;
        `,o.textContent=t.label;let s;return t.type==="select"&&Array.isArray(t.options)?s=this.createSelect(t,r):t.type==="checkbox"?s=this.createCheckbox(t,r):s=this.createNumberInput(t,r),e.appendChild(o),e.appendChild(s),e}createNumberInput(t,r){const e=document.createElement("input");if(e.type="number",e.value=(r==null?void 0:r.toString())||"",e.style.cssText=`
            width: 80px;
            padding: 4px 8px;
            background: var(--bg-base);
            border: 1px solid var(--border);
            border-radius: var(--radius-xs);
            color: var(--text-primary);
            font-size: var(--text-lg);
            font-family: var(--text-mono);
            text-align: right;
            outline: none;
            transition: border-color 0.15s ease;
        `,e.addEventListener("focus",()=>e.style.borderColor="var(--accent-info)"),e.addEventListener("blur",()=>e.style.borderColor="var(--border)"),t.options&&!Array.isArray(t.options)){const o=t.options;e.min=o.min.toString(),e.max=o.max.toString(),e.step=o.step.toString()}return e.addEventListener("change",()=>{this.settings[t.key]=parseFloat(e.value)}),e}createSelect(t,r){const e=document.createElement("select");return e.style.cssText=`
            padding: 4px 8px;
            background: var(--bg-base);
            border: 1px solid var(--border);
            border-radius: var(--radius-xs);
            color: var(--text-primary);
            font-size: var(--text-lg);
            font-family: var(--text-sans);
            cursor: pointer;
            outline: none;
            transition: border-color 0.15s ease;
        `,e.addEventListener("focus",()=>e.style.borderColor="var(--accent-info)"),e.addEventListener("blur",()=>e.style.borderColor="var(--border)"),t.options.forEach(o=>{const s=document.createElement("option");s.value=o,s.textContent=o.charAt(0).toUpperCase()+o.slice(1),o===r&&(s.selected=!0),e.appendChild(s)}),e.addEventListener("change",()=>{this.settings[t.key]=e.value}),e}createCheckbox(t,r){const e=document.createElement("input");return e.type="checkbox",e.checked=r===!0,e.style.cssText=`
            width: 16px;
            height: 16px;
            cursor: pointer;
            accent-color: var(--accent-info);
        `,e.addEventListener("change",()=>{this.settings[t.key]=e.checked}),e}createFooter(){const t=document.createElement("div");t.style.cssText=`
            display: flex;
            gap: 8px;
            padding: 10px 14px;
            border-top: 1px solid var(--border);
            background: var(--bg-card);
            flex-shrink: 0;
        `;const r=document.createElement("button");r.textContent="Cancel",r.style.cssText=`
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
        `,r.addEventListener("mouseenter",()=>{r.style.borderColor="var(--text-secondary)",r.style.color="var(--text-primary)"}),r.addEventListener("mouseleave",()=>{r.style.borderColor="var(--border)",r.style.color="var(--text-secondary)"}),r.addEventListener("click",()=>this.close());const e=document.createElement("button");return e.textContent="Apply",e.style.cssText=`
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
        `,e.addEventListener("mouseenter",()=>{e.style.background="rgba(var(--accent-info-rgb), 0.2)",e.style.borderColor="var(--accent-info)"}),e.addEventListener("mouseleave",()=>{e.style.background="rgba(var(--accent-info-rgb), 0.1)",e.style.borderColor="rgba(var(--accent-info-rgb), 0.3)"}),e.addEventListener("click",()=>{this.applySettings(),this.close()}),t.appendChild(r),t.appendChild(e),t}applySettings(){const t={indicatorId:this.item.id};this.color!==this.item.color&&(t.color=this.color),Object.keys(this.settings).length>0&&(t.settings={...this.settings}),document.dispatchEvent(new CustomEvent("indicator-settings-changed",{detail:t}))}setupDragging(){var r;const t=(r=this.modal)==null?void 0:r.querySelector("div");!t||!this.modal||(t.addEventListener("mousedown",e=>{e.preventDefault(),this.isDragging=!0;const o=this.modal.getBoundingClientRect();this.dragOffsetX=e.clientX-o.left,this.dragOffsetY=e.clientY-o.top,this.modal.style.transform="none",this.modal.style.cursor="grabbing",document.body.style.userSelect="none"}),document.addEventListener("mousemove",e=>{if(!this.isDragging||!this.modal)return;const o=e.clientX-this.dragOffsetX,s=e.clientY-this.dragOffsetY,n=window.innerWidth-this.modal.offsetWidth,a=window.innerHeight-this.modal.offsetHeight,i=Math.max(0,Math.min(o,n)),l=Math.max(0,Math.min(s,a));this.modal.style.left=`${i}px`,this.modal.style.top=`${l}px`}),document.addEventListener("mouseup",()=>{this.isDragging&&(this.isDragging=!1,this.modal.style.cursor="",document.body.style.userSelect="")}))}setupCloseOnOutsideClick(){setTimeout(()=>{const t=r=>{if(this.modal&&!this.modal.contains(r.target)){if(r.target.closest(".cp-container"))return;this.close(),document.removeEventListener("click",t)}};document.addEventListener("click",t)},100)}parseToHexOpacity(t){if(!t||typeof t!="string")return{hex:"#3b82f6",opacity:1};const r=t.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);if(r){const e=parseInt(r[1]),o=parseInt(r[2]),s=parseInt(r[3]),n=r[4]!==void 0?parseFloat(r[4]):1;return{hex:`#${e.toString(16).padStart(2,"0")}${o.toString(16).padStart(2,"0")}${s.toString(16).padStart(2,"0")}`,opacity:n}}return{hex:t.startsWith("#")?t:"#3b82f6",opacity:1}}hexToRgba(t,r){const e=t.replace("#",""),o=parseInt(e.substring(0,2),16),s=parseInt(e.substring(2,4),16),n=parseInt(e.substring(4,6),16);return`rgba(${o}, ${s}, ${n}, ${r})`}toDisplayColor(t){return t?this.parseToHexOpacity(t).hex:"#3b82f6"}}export{b as IndicatorSettingsModal};
