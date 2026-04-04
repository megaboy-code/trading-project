import{E as q,_ as m}from"./index-6QpOhZoS.js";const g={TrendLine:p(),Ray:p(),Arrow:p(),ExtendedLine:p(),HorizontalLine:p(),HorizontalRay:p(),VerticalLine:p(),CrossLine:p(),Path:p(),Text:[{type:"color",key:"text.font.color",label:"Text Color",default:"#2962ff"}],Callout:[{type:"color",key:"line.color",label:"Line Color",default:"#2962ff"},{type:"color",key:"text.font.color",label:"Text Color",default:"#ffffff"},{type:"color",key:"text.box.border.color",label:"Border Color",default:"rgba(74,144,226,1)"},{type:"color",key:"text.box.background.color",label:"BG Color",default:"rgba(19,73,133,1)"},{type:"width",key:"line.width",label:"Line Width",default:2},{type:"style",key:"line.style",label:"Line Style",default:0}],Rectangle:[{type:"color",key:"rectangle.border.color",label:"Border Color",default:"#9c27b0"},{type:"color",key:"rectangle.background.color",label:"Fill Color",default:"rgba(156,39,176,0.2)"},{type:"width",key:"rectangle.border.width",label:"Border Width",default:1},{type:"style",key:"rectangle.border.style",label:"Border Style",default:0}],Circle:[{type:"color",key:"circle.border.color",label:"Border Color",default:"#9c27b0"},{type:"color",key:"circle.background.color",label:"Fill Color",default:"rgba(156,39,176,0.2)"},{type:"width",key:"circle.border.width",label:"Border Width",default:1},{type:"style",key:"circle.border.style",label:"Border Style",default:0}],Triangle:[{type:"color",key:"triangle.border.color",label:"Border Color",default:"#f57c00"},{type:"color",key:"triangle.background.color",label:"Fill Color",default:"rgba(245,123,0,0.2)"},{type:"width",key:"triangle.border.width",label:"Border Width",default:1},{type:"style",key:"triangle.border.style",label:"Border Style",default:0}],ParallelChannel:[{type:"color",key:"channelLine.color",label:"Channel Color",default:"#2962ff"},{type:"color",key:"background.color",label:"Fill Color",default:"rgba(41,98,255,0.2)"},{type:"color",key:"middleLine.color",label:"Mid Line Color",default:"#2962ff"},{type:"width",key:"channelLine.width",label:"Line Width",default:1},{type:"style",key:"channelLine.style",label:"Line Style",default:0}],PriceRange:[{type:"color",key:"priceRange.rectangle.border.color",label:"Border Color",default:"#9c27b0"},{type:"color",key:"priceRange.rectangle.background.color",label:"Fill Color",default:"rgba(156,39,176,0.2)"},{type:"width",key:"priceRange.rectangle.border.width",label:"Border Width",default:1},{type:"style",key:"priceRange.rectangle.border.style",label:"Border Style",default:0}],FibRetracement:[{type:"width",key:"line.width",label:"Line Width",default:1},{type:"style",key:"line.style",label:"Line Style",default:0}],Brush:[{type:"color",key:"line.color",label:"Stroke Color",default:"rgba(0,188,212,1)"},{type:"color",key:"background.color",label:"Fill Color",default:"rgba(0,0,0,0)"},{type:"width",key:"line.width",label:"Stroke Width",default:2}],Highlighter:[{type:"color",key:"line.color",label:"Highlight Color",default:"rgba(255,255,0,0.4)"},{type:"color",key:"background.color",label:"Fill Color",default:"rgba(0,0,0,0)"},{type:"width",key:"line.width",label:"Highlight Width",default:20}],LongShortPosition:[{type:"color",key:"entryStopLossRectangle.background.color",label:"Risk Fill",default:"rgba(255,0,0,0.2)"},{type:"color",key:"entryPtRectangle.background.color",label:"Reward Fill",default:"rgba(0,128,0,0.2)"}]};function p(){return[{type:"color",key:"line.color",label:"Line Color",default:"#2962ff"},{type:"width",key:"line.width",label:"Line Width",default:2},{type:"style",key:"line.style",label:"Line Style",default:0}]}class C{constructor(e){this.container=null,this.currentTool=null,this.isDragging=!1,this.dragOffsetX=0,this.dragOffsetY=0,this.savedX=null,this.savedY=null,this.liveValues={},this.activeDropdown=null,this.handleOutsideClick=o=>{this.container&&(this.container.contains(o.target)||o.target.closest(".cp-container")||this.hide())},this.callbacks=e,this.injectStyles()}show(e){var r;if(!e)return;const o=((r=this.currentTool)==null?void 0:r.toolType)===e.toolType;if(this.currentTool=e,this.extractLiveValues(e),this.container&&o){this.updateAllControls();return}this.container&&this.removeContainer(),this.createToolbar(),this.positionToolbar()}hide(){this.container&&(this.container.classList.add("qtb-hiding"),setTimeout(()=>{this.removeContainer()},150),document.removeEventListener("mousedown",this.handleOutsideClick))}updateTool(e){e&&(this.currentTool=e,this.extractLiveValues(e),this.container&&this.updateAllControls())}removeContainer(){this.container&&document.body.contains(this.container)&&document.body.removeChild(this.container),this.container=null,this.activeDropdown=null}extractLiveValues(e){const o=g[e.toolType]||[],r=e.options||{};if(this.liveValues={},o.forEach(i=>{const a=q(r,i.key);this.liveValues[i.key]=a!==void 0?a:i.default}),r.text!==void 0){const i=q(r,"text.font.color");this.liveValues["text.font.color"]=i||"#2962ff"}}toolHasText(){var o;const e=(o=this.currentTool)==null?void 0:o.options;return e?e.text!==void 0:!1}createToolbar(){this.container=document.createElement("div"),this.container.className="qtb-container",this.container.innerHTML=this.buildHTML(),document.body.appendChild(this.container),this.setupDragging(),this.setupButtons(),this.updateAllControls(),setTimeout(()=>{document.addEventListener("mousedown",this.handleOutsideClick)},0)}buildHTML(){var a;const e=((a=this.currentTool)==null?void 0:a.toolType)||"",o=g[e]||[],r=this.toolHasText();let i="";if(o.forEach(n=>{const t=n.key.replace(/\./g,"_");i+='<div class="qtb-divider"></div>',n.type==="color"?i+=`
          <div class="qtb-item">
            <button class="qtb-color-btn" id="qtbColor_${t}"
                    title="${n.label}" data-key="${n.key}">
              <div class="qtb-color-dot" id="qtbDot_${t}"></div>
            </button>
          </div>
        `:n.type==="width"?i+=`
          <div class="qtb-item qtb-dropdown-wrap" id="qtbWidthWrap_${t}">
            <button class="qtb-btn" id="qtbWidthBtn_${t}"
                    title="${n.label}" data-key="${n.key}">
              <div class="qtb-width-preview" id="qtbWidthPrev_${t}"></div>
              <i class="fas fa-chevron-down qtb-chevron"></i>
            </button>
            <div class="qtb-dropdown" id="qtbWidthDd_${t}">
              ${[.5,1,2,3,4].map(l=>`
                <div class="qtb-dropdown-item qtb-width-item"
                     data-key="${n.key}" data-width="${l}">
                  <div class="qtb-width-line"
                       style="height:${Math.max(1,l)}px;opacity:${l===.5?.6:1};"></div>
                  <span class="qtb-width-label">${l}</span>
                </div>
              `).join("")}
            </div>
          </div>
        `:n.type==="style"&&(i+=`
          <div class="qtb-item qtb-dropdown-wrap" id="qtbStyleWrap_${t}">
            <button class="qtb-btn" id="qtbStyleBtn_${t}"
                    title="${n.label}" data-key="${n.key}">
              <div class="qtb-style-preview" id="qtbStylePrev_${t}"></div>
              <i class="fas fa-chevron-down qtb-chevron"></i>
            </button>
            <div class="qtb-dropdown" id="qtbStyleDd_${t}">
              ${[{value:0,label:"Solid",cls:"qtb-style-solid"},{value:1,label:"Dashed",cls:"qtb-style-dashed"},{value:2,label:"Dotted",cls:"qtb-style-dotted"}].map(l=>`
                <div class="qtb-dropdown-item qtb-style-item"
                     data-key="${n.key}" data-style="${l.value}">
                  <div class="qtb-style-line ${l.cls}"></div>
                  <span class="qtb-style-label">${l.label}</span>
                </div>
              `).join("")}
            </div>
          </div>
        `)}),r){const n=this.liveValues["text.font.color"]||"#2962ff",t=this.toDisplayColor(n);i+=`
        <div class="qtb-divider"></div>
        <div class="qtb-item">
          <button class="qtb-color-btn qtb-text-color-btn" id="qtbTextColorBtn"
                  title="Text Color">
            <div class="qtb-text-color-icon">
              <span class="qtb-t-letter" id="qtbTLetter">T</span>
              <div class="qtb-t-underline" id="qtbTUnderline"
                   style="background:${t};"></div>
            </div>
          </button>
        </div>
      `}return`
      <div class="qtb-drag-handle" title="Drag">
        <i class="fas fa-grip-vertical"></i>
      </div>

      ${i}

      <div class="qtb-divider"></div>
      <div class="qtb-item">
        <button class="qtb-btn" id="qtbSettingsBtn" title="Settings">
          <i class="fas fa-gear"></i>
        </button>
      </div>

      <div class="qtb-divider"></div>
      <div class="qtb-item">
        <button class="qtb-btn" id="qtbLockBtn" title="Lock tool">
          <i class="fas fa-lock-open" id="qtbLockIcon"></i>
        </button>
      </div>

      <div class="qtb-divider"></div>
      <div class="qtb-item">
        <button class="qtb-btn qtb-btn-danger" id="qtbDeleteBtn" title="Delete">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    `}updateAllControls(){var r;if(!this.container)return;(g[((r=this.currentTool)==null?void 0:r.toolType)||""]||[]).forEach(i=>{const a=i.key.replace(/\./g,"_"),n=this.liveValues[i.key];if(i.type==="color"){const t=this.container.querySelector(`#qtbDot_${a}`);t&&(t.style.background=this.toDisplayColor(n))}else if(i.type==="width"){const t=this.container.querySelector(`#qtbWidthPrev_${a}`);if(t){const l=parseFloat(n)||1;t.style.cssText=`width:20px;height:${Math.max(1,l)}px;background:var(--text-primary);border-radius:1px;opacity:${l===.5?.5:.8};`}}else if(i.type==="style"){const t=this.container.querySelector(`#qtbStylePrev_${a}`);if(t){const l={0:"solid",1:"dashed",2:"dotted"};t.style.cssText=`width:22px;height:0;border-top:2px ${l[n]||"solid"} var(--text-secondary);margin:auto 0;`}}});const o=this.container.querySelector("#qtbTUnderline");o&&(o.style.background=this.toDisplayColor(this.liveValues["text.font.color"])),this.updateLockButton()}updateLockButton(){var i,a,n,t;const e=(i=this.container)==null?void 0:i.querySelector("#qtbLockIcon"),o=(a=this.container)==null?void 0:a.querySelector("#qtbLockBtn");if(!e||!o)return;const r=((t=(n=this.currentTool)==null?void 0:n.options)==null?void 0:t.locked)||!1;e.className=r?"fas fa-lock":"fas fa-lock-open",o.title=r?"Unlock tool":"Lock tool",o.classList.toggle("qtb-btn-active",r)}setupButtons(){var r,i,a,n;if(!this.container)return;(g[((r=this.currentTool)==null?void 0:r.toolType)||""]||[]).forEach(t=>{const l=t.key.replace(/\./g,"_");if(t.type==="color"){const s=this.container.querySelector(`#qtbColor_${l}`);s==null||s.addEventListener("click",async d=>{d.stopPropagation(),this.closeDropdowns();const{ColorPicker:h}=await m(async()=>{const{ColorPicker:u}=await import("./index-Ctv2f_o8.js");return{ColorPicker:u}},[]),c=this.parseToHexOpacity(this.liveValues[t.key]);new h({color:c.hex,opacity:c.opacity,onChange:(u,f)=>{var x;const y=f<1?this.hexToRgba(u,f):u;this.liveValues[t.key]=y;const v=(x=this.container)==null?void 0:x.querySelector(`#qtbDot_${l}`);if(v&&(v.style.background=this.toDisplayColor(y)),this.currentTool){const k={};this.setNestedValue(k,t.key,y),this.callbacks.onToolUpdate(this.currentTool.id,k)}}}).open(s)})}else if(t.type==="width"){const s=this.container.querySelector(`#qtbWidthBtn_${l}`);s==null||s.addEventListener("click",d=>{d.stopPropagation(),this.toggleDropdown(`qtbWidthDd_${l}`)}),this.container.querySelectorAll(`.qtb-width-item[data-key="${t.key}"]`).forEach(d=>{d.addEventListener("click",h=>{h.stopPropagation();const c=parseFloat(d.dataset.width||"1");if(this.liveValues[t.key]=c,this.updateAllControls(),this.closeDropdowns(),this.currentTool){const b={};this.setNestedValue(b,t.key,c),this.callbacks.onToolUpdate(this.currentTool.id,b)}})})}else if(t.type==="style"){const s=this.container.querySelector(`#qtbStyleBtn_${l}`);s==null||s.addEventListener("click",d=>{d.stopPropagation(),this.toggleDropdown(`qtbStyleDd_${l}`)}),this.container.querySelectorAll(`.qtb-style-item[data-key="${t.key}"]`).forEach(d=>{d.addEventListener("click",h=>{h.stopPropagation();const c=parseInt(d.dataset.style||"0");if(this.liveValues[t.key]=c,this.updateAllControls(),this.closeDropdowns(),this.currentTool){const b={};this.setNestedValue(b,t.key,c),this.callbacks.onToolUpdate(this.currentTool.id,b)}})})}});const o=this.container.querySelector("#qtbTextColorBtn");o&&o.addEventListener("click",async t=>{t.stopPropagation(),this.closeDropdowns();const{ColorPicker:l}=await m(async()=>{const{ColorPicker:h}=await import("./index-Ctv2f_o8.js");return{ColorPicker:h}},[]),s=this.parseToHexOpacity(this.liveValues["text.font.color"]);new l({color:s.hex,opacity:s.opacity,onChange:(h,c)=>{var f;const b=c<1?this.hexToRgba(h,c):h;this.liveValues["text.font.color"]=b;const u=(f=this.container)==null?void 0:f.querySelector("#qtbTUnderline");if(u&&(u.style.background=this.toDisplayColor(b)),this.currentTool){const y={};this.setNestedValue(y,"text.font.color",b),this.callbacks.onToolUpdate(this.currentTool.id,y)}}}).open(o)}),(i=this.container.querySelector("#qtbSettingsBtn"))==null||i.addEventListener("click",t=>{t.stopPropagation(),this.closeDropdowns(),this.currentTool&&(this.hide(),this.callbacks.onSettingsClick(this.currentTool))}),(a=this.container.querySelector("#qtbLockBtn"))==null||a.addEventListener("click",t=>{var l;if(t.stopPropagation(),this.closeDropdowns(),this.currentTool){const s=((l=this.currentTool.options)==null?void 0:l.locked)||!1;this.currentTool.options=this.currentTool.options||{},this.currentTool.options.locked=!s,this.updateLockButton(),this.callbacks.onLockToggle(this.currentTool.id,!s)}}),(n=this.container.querySelector("#qtbDeleteBtn"))==null||n.addEventListener("click",t=>{var l;if(t.stopPropagation(),this.closeDropdowns(),this.currentTool){if((l=this.currentTool.options)!=null&&l.locked){alert("This tool is locked. Unlock it first to delete.");return}this.callbacks.onDelete(this.currentTool.id),this.hide()}})}toggleDropdown(e){var r;if(this.activeDropdown===e){this.closeDropdowns();return}this.closeDropdowns();const o=(r=this.container)==null?void 0:r.querySelector(`#${e}`);o&&(o.classList.add("qtb-dropdown-open"),this.activeDropdown=e)}closeDropdowns(){this.container&&(this.container.querySelectorAll(".qtb-dropdown").forEach(e=>e.classList.remove("qtb-dropdown-open")),this.activeDropdown=null)}positionToolbar(){if(!this.container)return;if(this.savedX!==null&&this.savedY!==null){this.container.style.left=`${this.savedX}px`,this.container.style.top=`${this.savedY}px`;return}const o=(document.getElementById("mainChartArea")||document.body).getBoundingClientRect(),r=this.container.offsetWidth||300,i=o.left+(o.width-r)/2,a=o.top+48;this.container.style.left=`${i}px`,this.container.style.top=`${a}px`}setupDragging(){var o;const e=(o=this.container)==null?void 0:o.querySelector(".qtb-drag-handle");!e||!this.container||(e.addEventListener("mousedown",r=>{r.preventDefault(),this.isDragging=!0;const i=this.container.getBoundingClientRect();this.dragOffsetX=r.clientX-i.left,this.dragOffsetY=r.clientY-i.top,this.container.classList.add("qtb-dragging"),document.body.style.userSelect="none"}),document.addEventListener("mousemove",r=>{if(!this.isDragging||!this.container)return;const i=r.clientX-this.dragOffsetX,a=r.clientY-this.dragOffsetY,n=window.innerWidth-this.container.offsetWidth,t=window.innerHeight-this.container.offsetHeight,l=Math.max(0,Math.min(i,n)),s=Math.max(0,Math.min(a,t));this.container.style.left=`${l}px`,this.container.style.top=`${s}px`,this.savedX=l,this.savedY=s}),document.addEventListener("mouseup",()=>{var r;this.isDragging&&(this.isDragging=!1,(r=this.container)==null||r.classList.remove("qtb-dragging"),document.body.style.userSelect="")}))}parseToHexOpacity(e){if(!e||typeof e!="string")return{hex:"#3b82f6",opacity:1};const o=e.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);if(o){const r=parseInt(o[1]),i=parseInt(o[2]),a=parseInt(o[3]),n=o[4]!==void 0?parseFloat(o[4]):1;return{hex:`#${r.toString(16).padStart(2,"0")}${i.toString(16).padStart(2,"0")}${a.toString(16).padStart(2,"0")}`,opacity:n}}return{hex:e.startsWith("#")?e:"#3b82f6",opacity:1}}hexToRgba(e,o){const r=e.replace("#",""),i=parseInt(r.substring(0,2),16),a=parseInt(r.substring(2,4),16),n=parseInt(r.substring(4,6),16);return`rgba(${i}, ${a}, ${n}, ${o})`}toDisplayColor(e){return e?this.parseToHexOpacity(e).hex:"#3b82f6"}setNestedValue(e,o,r){const i=o.split("."),a=i.pop();let n=e;for(const t of i)(!(t in n)||typeof n[t]!="object")&&(n[t]={}),n=n[t];n[a]=r}injectStyles(){if(document.getElementById("qtb-styles"))return;const e=document.createElement("style");e.id="qtb-styles",e.textContent=`
      .qtb-container {
        position: fixed;
        display: flex;
        align-items: center;
        gap: 2px;
        background: var(--bg-elevated);
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 4px 6px;
        box-shadow: var(--card-shadow);
        z-index: 10002;
        user-select: none;
        animation: qtbFadeIn 0.15s ease;
        min-height: 34px;
        font-family: var(--text-sans);
      }

      .qtb-container.qtb-hiding {
        animation: qtbFadeOut 0.15s ease forwards;
      }

      .qtb-container.qtb-dragging {
        box-shadow: 0 16px 40px rgba(0,0,0,0.6);
        transform: scale(1.02);
      }

      @keyframes qtbFadeIn {
        from { opacity: 0; transform: translateY(-4px); }
        to   { opacity: 1; transform: translateY(0); }
      }

      @keyframes qtbFadeOut {
        from { opacity: 1; transform: translateY(0); }
        to   { opacity: 0; transform: translateY(-4px); }
      }

      .qtb-drag-handle {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 26px;
        color: var(--text-muted);
        cursor: grab;
        border-radius: 4px;
        transition: color 0.15s;
        flex-shrink: 0;
        font-size: 11px;
      }

      .qtb-drag-handle:hover  { color: var(--text-secondary); background: var(--bg-hover); }
      .qtb-drag-handle:active { cursor: grabbing; color: var(--text-primary); }

      .qtb-divider {
        width: 1px;
        height: 18px;
        background: var(--border);
        flex-shrink: 0;
        margin: 0 2px;
      }

      .qtb-item {
        position: relative;
        display: flex;
        align-items: center;
      }

      .qtb-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        height: 26px;
        padding: 0 6px;
        background: transparent;
        border: 1px solid transparent;
        border-radius: 5px;
        color: var(--text-secondary);
        font-size: 12px;
        cursor: pointer;
        transition: all 0.15s;
        min-width: 26px;
        font-family: var(--text-sans);
      }

      .qtb-btn:hover {
        background: var(--bg-hover);
        color: var(--text-primary);
        border-color: var(--border-light);
      }

      .qtb-btn-active {
        background: var(--bg-active) !important;
        color: var(--accent-info) !important;
        border-color: var(--border-light) !important;
      }

      .qtb-btn-danger:hover {
        background: rgba(var(--accent-sell-rgb), 0.12) !important;
        color: var(--accent-sell) !important;
        border-color: rgba(var(--accent-sell-rgb), 0.3) !important;
      }

      .qtb-color-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 26px;
        height: 26px;
        background: transparent;
        border: 1px solid transparent;
        border-radius: 5px;
        cursor: pointer;
        transition: all 0.15s;
        padding: 0;
      }

      .qtb-color-btn:hover {
        background: var(--bg-hover);
        border-color: var(--border-light);
      }

      .qtb-color-dot {
        width: 14px;
        height: 14px;
        border-radius: 50%;
        border: 2px solid var(--border-light);
        transition: border-color 0.15s;
        flex-shrink: 0;
      }

      .qtb-color-btn:hover .qtb-color-dot { border-color: var(--text-muted); }

      /* ✅ Text color T button */
      .qtb-text-color-btn {
        width: 28px;
        height: 26px;
        flex-direction: column;
        gap: 1px;
      }

      .qtb-text-color-icon {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
      }

      .qtb-t-letter {
        font-size: 12px;
        font-weight: 700;
        color: var(--text-primary);
        line-height: 1;
        font-family: var(--text-sans);
      }

      .qtb-t-underline {
        width: 14px;
        height: 3px;
        border-radius: 1px;
      }

      .qtb-chevron { font-size: 8px !important; color: var(--text-muted); }

      .qtb-dropdown-wrap { position: relative; }

      .qtb-dropdown {
        position: absolute;
        top: calc(100% + 6px);
        left: 50%;
        transform: translateX(-50%);
        background: var(--bg-elevated);
        border: 1px solid var(--border);
        border-radius: 8px;
        box-shadow: var(--card-shadow);
        padding: 4px;
        display: none;
        flex-direction: column;
        gap: 2px;
        min-width: 100px;
        z-index: 10003;
      }

      .qtb-dropdown-open { display: flex !important; }

      .qtb-dropdown-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 7px 10px;
        border-radius: 5px;
        cursor: pointer;
        transition: background 0.15s;
        white-space: nowrap;
      }

      .qtb-dropdown-item:hover { background: var(--bg-hover); }

      .qtb-width-line {
        width: 50px;
        background: var(--text-secondary);
        border-radius: 1px;
        flex-shrink: 0;
      }

      .qtb-width-label {
        font-size: 11px;
        color: var(--text-muted);
        font-family: var(--text-mono);
        min-width: 20px;
      }

      .qtb-style-line   { width: 50px; height: 0; flex-shrink: 0; }
      .qtb-style-solid  { border-top: 2px solid var(--text-secondary); }
      .qtb-style-dashed { border-top: 2px dashed var(--text-secondary); }
      .qtb-style-dotted { border-top: 2px dotted var(--text-secondary); }

      .qtb-style-label {
        font-size: 11px;
        color: var(--text-muted);
        font-family: var(--text-sans);
      }
    `,document.head.appendChild(e)}destroy(){document.removeEventListener("mousedown",this.handleOutsideClick),this.removeContainer()}}export{C as ToolQuickToolbar};
