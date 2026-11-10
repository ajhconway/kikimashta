// Small, code-native illustrations keep quantities exact and diagrams consistent.
const ink = '#4b2369';
// Brighter fills and purple outlines echo the app's existing picture bank.
const palette = {
  '#c66b50':'#ff568b','#7e966c':'#94d767','#e7a18a':'#ffe2ef',
  '#dfa157':'#ffb13c','#6f8a58':'#6dbe56','#849a66':'#95d76b','#bf823e':'#e38a23',
  '#fcf5db':'#fff6dc','#e3d6b4':'#ffdc92','#d9ad73':'#ffc66f','#84664d':'#8a4d6c',
  '#faf9ed':'#f8f1ff','#c6cdbb':'#bda4e5','#f1f0e1':'#fff','#dce0cf':'#e5d5ff',
  '#c08a61':'#ffae3f','#d3a379':'#ffc254','#deb087':'#ffca62','#bd806a':'#ff89b3','#b78762':'#dc7a29',
  '#e0c591':'#ffda93','#d9b780':'#ffc66a','#bc9c68':'#eaa14b','#eee0b7':'#fff0b7','#a4885f':'#9b5c76',
  '#cdd4c3':'#e3d7f5','#e4be79':'#ffcf5a','#fffdf3':'#fff5fc',
  '#fbf2d8':'#fff0ce','#b7755d':'#ff89b3','#a6ad86':'#b88cf3','#b6d2ca':'#7ad9ee',
  '#9b8b68':'#95609c','#90a37c':'#9ed76d','#78926d':'#73c76b',
  '#becbb1':'#b6d9a0','#8dA482':'#88cb83','#f6f3df':'#fff','#b5c29d':'#c4e6a1','#e1d1a5':'#ffe0a2',
  '#b6c69e':'#a9e88c','#9bbfc3':'#6bcfee','#e0ebe0':'#e1faff','#9ebfc1':'#6bcfee','#e6d8ad':'#ffe0a2','#e5eee3':'#e1faff','#b5785f':'#ff89b3','#fbf4dc':'#fff6dc',
  '#b4baaa':'#d5bcea','#bcc4af':'#c6a6f8','#f6f5e5':'#fff6dc','#b8c9a1':'#a9e88c','#947b59':'#b17a9e',
  '#667563':'#7e5bb2','#789281':'#b88cf3','#d7ad8b':'#ffd3b3','#ddb99a':'#ffd3b3','#6b6756':'#63427d','#e5d4a1':'#ffdb83',
  '#d9decc':'#f1e8fa','#8ca191':'#b88cf3','#c39176':'#ff98bb',
  '#c6cfb8':'#e3d7f5','#8b9e87':'#b386f7','#677662':'#7e5bb2','#d8ae8b':'#ffd3b3','#bd8f69':'#ffad65','#a6c4c5':'#6bcfee','#a88f69':'#b47cb7',
  '#dbe0d1':'#f1e8fa','#b86c59':'#ed6b86','#8ba18c':'#b386f7','#fbf8e6':'#fff7fc','#c6ceba':'#d1b7eb','#b78a71':'#f485b1','#b3986d':'#c798c8','#c7cebb':'#d1b7eb','#f8f6e2':'#fff7fc'
};
const wrap = body => `<svg viewBox="0 0 280 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><g stroke="${ink}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round">${body.replace(/#[0-9a-fA-F]{6}/g, color => palette[color] || color)}</g></svg>`;
const ellipse = (x,y,rx,ry,fill,extra='') => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}" ${extra}/>`;
const apple = () => `<path d="M0-12C-23-25-30 4-16 21Q-7 31 0 25Q9 31 18 20C32-1 20-25 0-12Z" fill="#c66b50"/><path d="M0-10Q-2-21 4-26" fill="none"/><path d="M3-20Q13-29 21-22Q14-13 3-20" fill="#7e966c"/>${ellipse(-11,-1,3,6,'#e7a18a','stroke="none"')}`;
const orange = () => `${ellipse(0,4,23,21,'#dfa157')}<path d="M-4-18L3-20L7-16L1-14Z" fill="#6f8a58"/><path d="M2-19Q9-30 21-24Q17-15 2-19" fill="#849a66"/><path d="M-13-1L-14 5M12 11L12 12" stroke="#bf823e"/>`;
const egg = () => `<path d="M-20 10C-24-2-9-29 0-29S24-2 20 10C17 29-17 29-20 10Z" fill="#fcf5db"/><path d="M-11-6Q-15 4-11 12" stroke="#e3d6b4" stroke-width="4" fill="none"/>`;
const cookie = () => `<path d="M-21-15Q-14-25-4-22Q5-27 14-18Q26-13 23-2Q29 7 20 16Q14 28 2 23Q-8 28-17 19Q-29 12-22 0Q-28-9-21-15Z" fill="#d9ad73"/>${[[-11,-7],[9,-12],[13,7],[-7,12],[0,0]].map(([x,y])=>ellipse(x,y,3,3,'#84664d','stroke="none"')).join('')}`;
function countArt({food,count}) {
  const symbol={apples:apple,oranges:orange,eggs:egg,cookies:cookie}[food];
  const cols=count<=4?2:3;
  const rows=Math.ceil(count/cols);
  const spacingX=count<=4?65:60, spacingY=count<=4?60:49;
  const scale=count<=4?.88:.68;
  let shapes='';
  for(let i=0;i<count;i++){
    const row=Math.floor(i/cols), rowCount=Math.min(cols,count-row*cols);
    const x=140+(i%cols-(rowCount-1)/2)*spacingX;
    const y=104+(row-(rows-1)/2)*spacingY;
    shapes+=`<g data-counted-item="${food}" transform="translate(${x} ${y}) scale(${scale})">${symbol()}</g>`;
  }
  return ellipse(140,115,110,74,'#faf9ed','stroke="#c6cdbb"')+ellipse(140,112,99,65,'#f1f0e1','stroke="#dce0cf"')+shapes;
}
function cat(x,y,scale=1){return `<g transform="translate(${x} ${y}) scale(${scale})"><path d="M-20 22Q-35 20-32 4Q-30-6-23 0" fill="none" stroke-width="6" stroke="#c08a61"/><path d="M-19 23Q-23 1-12-9L13-9Q24 3 20 23Z" fill="#d3a379"/><path d="M-22-10L-21-32L-7-23Q0-26 9-23L22-32L24-9Q24 6 2 7Q-19 7-22-10Z" fill="#deb087"/><path d="M-17-23L-11-19M17-23L12-19" stroke="#bd806a"/><path d="M-10-7L-8-7M11-7L13-7M0-1L3-1M-17 0L-27-2M-17 4L-27 6M19 0L29-2M19 4L29 6"/><path d="M-10 23L-3 23M11 23L18 23"/><path d="M-5-21L-3-14M4-22L6-15" stroke="#b78762"/></g>`;}
function box(x,y,scale=1){return `<g transform="translate(${x} ${y}) scale(${scale})"><path d="M-36-16L-22-28L37-28L23-16Z" fill="#e0c591"/><path d="M-36-16H23V32H-36Z" fill="#d9b780"/><path d="M23-16L37-28V19L23 32Z" fill="#bc9c68"/><path d="M-7-28L-19-16V-1H-5V-16L7-28" fill="#eee0b7" stroke="none"/><path d="M-23 18H-10" stroke="#a4885f"/></g>`;}
function spatialArt({position}){
  const positions={below:{cat:[140,72],box:[142,135]},above:{cat:[140,142],box:[142,72]},left:{cat:[193,112],box:[91,112]},right:{cat:[90,112],box:[195,112]}};
  const p=positions[position];
  return `<path d="M39 174H241" stroke="#cdd4c3"/>${box(...p.box,.95)}${cat(...p.cat,1.02)}`;
}
function house(x,y,scale=1){return `<g transform="translate(${x} ${y}) scale(${scale})"><path d="M-31-7V36H31V-7" fill="#fbf2d8"/><path d="M-41-5L0-38L41-5Z" fill="#b7755d"/><path d="M17-25V-38H27V-17" fill="#b7755d"/><path d="M-8 36V12H9V36" fill="#a6ad86"/><path d="M-23 5H-14V15H-23ZM16 5H25V15H16Z" fill="#b6d2ca"/></g>`;}
function tree(x,y,s=1){return `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 0V35" stroke="#9b8b68" stroke-width="4"/><path d="M-21 6L0-38L21 6Z" fill="#90a37c"/><path d="M-16-11L0-45L16-11Z" fill="#78926d"/></g>`;}
function landscapeArt({place,house:hasHouse}){
  let body=ellipse(227,42,14,14,'#e4be79','stroke="none"')+'<path d="M38 50Q48 37 60 45Q67 29 81 43Q93 41 96 50Z" fill="#fffdf3" stroke="none"/>';
  if(place==='mountain'){
    body+='<path d="M10 176L82 72L149 176Z" fill="#becbb1" stroke="none"/><path d="M60 179L158 32L267 179Z" fill="#8dA482"/><path d="M127 79L158 32L194 81L173 70L158 79L143 70Z" fill="#f6f3df"/><path d="M106 141L130 104L169 105L189 141Z" fill="#b5c29d" stroke="none"/>';
    if(hasHouse)body+=house(151,112,.57);
    else body+='<path d="M154 177Q130 152 159 131" fill="none" stroke="#e1d1a5" stroke-width="9"/>';
  }else if(place==='river'){
    body+='<path d="M10 100Q68 73 140 100Q217 74 270 103V181H10Z" fill="#b6c69e" stroke="none"/><path d="M135 89Q81 115 141 135Q176 149 96 181H206Q247 147 188 125Q137 111 160 89Z" fill="#9bbfc3"/><path d="M143 112L155 116M165 145L180 148M143 164L156 166" stroke="#e0ebe0"/>';
    body+=tree(41,118,.62)+tree(232,107,.52);
    if(hasHouse)body+=house(76,119,.65);
  }else if(place==='sea'){
    body+='<path d="M10 95H270V181H10Z" fill="#9ebfc1" stroke="none"/><path d="M10 159Q57 125 109 159Q165 183 270 160V190H10Z" fill="#e6d8ad" stroke="none"/><path d="M25 110Q40 115 53 110M93 126Q108 131 121 126M190 110Q205 115 218 110M217 145Q232 150 245 145" stroke="#e5eee3" fill="none"/>';
    if(hasHouse)body+=house(75,135,.72);
    else body+='<path d="M135 112H172L163 123H143Z" fill="#b5785f"/><path d="M153 108V64L179 105H153Z" fill="#fbf4dc"/>';
  }else if(place==='city'){
    body+='<path d="M15 170H265" stroke="#b4baaa"/>';
    for(const [x,y,h]of [[32,84,85],[80,55,114],[188,65,104],[228,98,71]]){body+=`<rect x="${x}" y="${y}" width="33" height="${h}" rx="2" fill="#bcc4af"/>`;for(let r=0;r<3;r++)body+=`<path d="M${x+8} ${y+14+r*20}h5m6 0h5" stroke="#f6f5e5" stroke-width="5"/>`;}
    body+=house(145,137,.8);
  }else{
    body+='<path d="M10 130Q70 96 140 120Q204 100 270 130V182H10Z" fill="#b8c9a1" stroke="none"/><path d="M106 182Q118 146 174 131" fill="none" stroke="#e1d1a5" stroke-width="16"/>';
    body+=tree(54,113,.9)+tree(226,103,.8)+'<path d="M143 148H208M143 139H208M148 149V163M202 149V163" stroke="#947b59" stroke-width="5"/>';
  }
  return body;
}
function person(x,y,age='adult',shirt='#789281'){
  const baby=age==='baby',child=age==='child';const s=baby?.55:child?.72:1;
  return `<g transform="translate(${x} ${y}) scale(${s})">${baby?'':`<path d="M-13 6L-15 42L-6 63M13 6L15 42L6 63" stroke="#667563" stroke-width="12" fill="none"/>`}<path d="M-20-30Q0-39 20-30L24 14H-24Z" fill="${shirt}"/><path d="M-20-25L-30 9M20-25L30 9" fill="none" stroke="#d7ad8b" stroke-width="10"/>${ellipse(0,-55,baby?23:19,24,'#ddb99a')}<path d="M-18-62Q-20-82 0-82Q20-82 19-62Q12-73 3-72Q-5-63-18-62" fill="#6b6756"/><path d="M-7-54L-6-54M7-54L8-54M-4-44Q0-41 5-44" fill="none"/>${baby?'<path d="M-23 7Q-44 22-20 40L0 22L21 40Q45 21 23 7" fill="#e5d4a1"/><path d="M-2-80Q-9-92-1-94Q9-94 5-85" fill="none"/>':''}</g>`;
}
function peopleArt({age}){
  const body=ellipse(140,171,101,8,'#d9decc','stroke="none"');
  if(age==='cat')return body+cat(95,139,1.1)+cat(187,139,1.1);
  const y=age==='adult'?104:age==='child'?124:148;
  return body+person(92,y,age,'#8ca191')+person(187,y,age,'#c39176');
}
function effortArt({mode}){
  let body='<path d="M25 173H256" stroke="#c6cfb8"/>';
  if(mode==='carry')return body+person(139,106,'adult','#8b9e87')+box(142,112,.8)+'<path d="M108 119L117 131M170 119L165 131" stroke="#d7ad8b" stroke-width="10"/>';
  body+=box(197,137,1.05);
  if(mode==='hard'){
    body+='<path d="M57 167L87 132L112 132L120 167" fill="none" stroke="#677662" stroke-width="12"/><path d="M81 125L101 90Q107 84 117 91L136 113L118 137Z" fill="#8b9e87"/><path d="M119 106L139 122L157 122M105 114L132 132L157 132" stroke="#d8ae8b" stroke-width="9" fill="none"/>';
    body+=ellipse(122,76,16,19,'#ddb99a')+'<path d="M108 67Q109 49 128 57L138 66" fill="#6b6756"/><path d="M130 75L135 77M130 87L135 86"/><path d="M91 66L85 54M82 79L69 75M96 87L85 93" stroke="#bd8f69" stroke-width="3"/><path d="M147 76Q142 88 148 88Q154 88 147 76" fill="#a6c4c5" stroke="none"/>';
  }else if(mode==='gentle'){
    body+=person(95,105,'adult','#8b9e87')+'<path d="M117 93L135 113L150 113" stroke="#d8ae8b" stroke-width="8" fill="none"/><path d="M149 113H158" stroke="#d8ae8b" stroke-width="4"/>';
  }else{
    body+=person(75,105,'adult','#8b9e87')+'<path d="M99 101L114 116L147 122" stroke="#d8ae8b" stroke-width="9" fill="none"/><path d="M145 123L164 142L169 123" fill="none" stroke="#a88f69" stroke-width="4"/><path d="M118 55H83L93 46M83 55L93 64" fill="none" stroke="#a88f69" stroke-width="3"/>';
  }
  return body;
}
function injuryArt({kind}){
  let body=ellipse(140,178,96,7,'#dbe0d1','stroke="none"');
  if(kind==='scratch')return body+'<path d="M48 151L105 111L158 105L191 82Q201 75 206 83L193 100L218 91Q229 91 226 100L206 116L174 131L115 139L67 172Z" fill="#ddb99a"/><path d="M112 118L120 124M123 113L131 119" stroke="#b86c59" stroke-width="2.5"/><path d="M51 151L65 172L80 163L66 141Z" fill="#8ba18c"/>';
  body+=person(140,109,'adult','#8b9e87');
  if(kind==='arm')body+='<path d="M113 95L124 125L161 119L165 134L116 143L101 103Z" fill="#fbf8e6"/><path d="M116 101L124 125L160 123M119 134L157 128" fill="none" stroke="#c6ceba"/><path d="M122 77L170 123L154 138" fill="none" stroke="#b78a71" stroke-width="3"/>';
  if(kind==='leg')body+='<path d="M146 130L146 172L168 175L169 165L160 161L160 130Z" fill="#fbf8e6"/><path d="M147 140H159M147 149H159M147 158H159" stroke="#c6ceba"/><path d="M91 105L79 175M102 108L91 177M82 145L96 148M88 103L105 106" stroke="#b3986d" stroke-width="5"/>';
  if(kind==='head')body+='<path d="M120 46Q121 23 140 22Q160 22 160 46L148 39L122 47Z" fill="#fbf8e6"/><path d="M122 33Q141 27 157 35M121 40Q139 33 160 42" stroke="#c7cebb" fill="none"/><path d="M123 48L141 66L152 52" fill="none" stroke="#f8f6e2" stroke-width="9"/>';
  return body;
}
export function illustration(art){
  const render={count:countArt,spatial:spatialArt,landscape:landscapeArt,people:peopleArt,effort:effortArt,injury:injuryArt}[art.type];
  if(!render)throw new Error(`Unknown illustration type: ${art.type}`);
  return wrap(render(art));
}
