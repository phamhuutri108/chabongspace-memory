import React,{useEffect,useMemo,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import './styles.css';

const API='/api';
const Icon=({name})=>{const d={search:[<circle cx="11" cy="11" r="6.5"/>,<path d="m16 16 4.2 4.2"/>],filter:[<path d="M4 5h16"/>,<path d="M7 12h10"/>,<path d="M10 19h4"/>],plus:[<path d="M12 5v14"/>,<path d="M5 12h14"/>],camera:[<path d="M4 8.5h3l1.5-2h7L17 8.5h3v9H4z"/>,<circle cx="12" cy="13" r="3"/>],fit:[<path d="M8 3H3v5"/>,<path d="M16 3h5v5"/>,<path d="M8 21H3v-5"/>,<path d="M16 21h5v-5"/>],close:[<path d="m6 6 12 12"/>,<path d="m18 6-12 12"/>],capture:[<circle cx="12" cy="12" r="6.5"/>],enter:[<path d="M4 12h11"/>,<path d="m11 7 5 5-5 5"/>,<path d="M20 5v14"/>]}[name];return <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>};
const demo=Array.from({length:50},(_,i)=>{
  const months=['01','02','03','04','05','06','07','08','09','10','11','12'];
  const day=String((i*7)%27+1).padStart(2,'0');
  const month=months[i%12];
  const captions=['một ngày rất bình thường','ăn cùng nhau','đi đâu đó','những buổi chiều','ở nhà','một chuyến đi','cà phê sáng','sunset','tiny moments','just us'];
  const h=i%3===0?1100:i%3===1?750:900;
  return {id:'demo-'+(i+1),src:`https://picsum.photos/seed/chabong-memory-${i+1}/900/${h}`,ratio:900/h,date:`2026-${month}-${day}`,tag:['us','food','trip','home','travel'][i%5],caption:captions[i%captions.length]};
});

const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));

function collision(a,b,gap=32){
  return !(a.x+a.w+gap<=b.x||b.x+b.w+gap<=a.x||a.y+a.h+gap<=b.y||b.y+b.h+gap<=a.y);
}

function pushApart(rects,gap=32){
  for(let pass=0;pass<18;pass++){
    let moved=false;
    for(let i=0;i<rects.length;i++){
      for(let j=i+1;j<rects.length;j++){
        const a=rects[i],b=rects[j];
        if(!collision(a,b,gap))continue;
        const overlapX=Math.min(a.x+a.w+gap-b.x,b.x+b.w+gap-a.x);
        const overlapY=Math.min(a.y+a.h+gap-b.y,b.y+b.h+gap-a.y);
        if(overlapX<overlapY){
          const dir=(a.x+a.w/2)<(b.x+b.w/2)?-1:1;
          const d=overlapX/2;
          a.x+=dir*d;b.x-=dir*d;
        }else{
          const dir=(a.y+a.h/2)<(b.y+b.h/2)?-1:1;
          const d=overlapY/2;
          a.y+=dir*d;b.y-=dir*d;
        }
        moved=true;
      }
    }
    if(!moved)break;
  }
  return rects;
}

function buildCollage(items){
  if(!items.length)return {items:[],bounds:{x:0,y:0,w:1,h:1}};
  const gap=34;
  const maxRowWidth=2500;
  const baseHeights=[300,215,235,200,285,220,245];
  const ordered=[...items].map((item,i)=>({...item,__index:i}));
  const rows=[];
  let row=[];
  let estimated=0;
  ordered.forEach((item,i)=>{
    const h=baseHeights[i%baseHeights.length];
    const w=clamp((item.ratio||1)*h,120,430);
    if(row.length&&estimated+w+gap>maxRowWidth){rows.push(row);row=[];estimated=0}
    row.push({item,h,w});estimated+=w+gap;
  });
  if(row.length)rows.push(row);

  const rects=[];
  let y=0;
  rows.forEach((r,rowIndex)=>{
    const rowGap=42;
    const natural=r.reduce((s,x)=>s+x.w,0)+gap*(r.length-1);
    const target=Math.min(maxRowWidth,natural);
    const scale=natural>maxRowWidth?maxRowWidth/natural:1;
    const heights=r.map(x=>x.h*scale);
    const widths=r.map((x,i)=>x.w*scale);
    const used=widths.reduce((s,w)=>s+w,0)+gap*(r.length-1);
    const stagger=(rowIndex%3-1)*105;
    let x=(maxRowWidth-used)/2+stagger;
    r.forEach((xItem,i)=>{
      const h=heights[i],w=widths[i];
      rects.push({id:xItem.item.id,x,y,w,h});
      x+=w+gap;
    });
    y+=Math.max(...heights)+rowGap;
  });

  pushApart(rects,gap);

  const minX=Math.min(...rects.map(r=>r.x)),minY=Math.min(...rects.map(r=>r.y));
  const maxX=Math.max(...rects.map(r=>r.x+r.w)),maxY=Math.max(...rects.map(r=>r.y+r.h));
  const pad=70;
  const shifted=rects.map(r=>({...r,x:r.x-minX+pad,y:r.y-minY+pad}));
  const bounds={x:0,y:0,w:maxX-minX+pad*2,h:maxY-minY+pad*2};
  const map=new Map(shifted.map(r=>[r.id,r]));
  return {items:items.map(item=>map.get(item.id)),bounds};
}

function App(){
  const[authed,setAuthed]=useState(()=>sessionStorage.getItem('memory-auth')==='1');
  const[password,setPassword]=useState('');
  const[photos,setPhotos]=useState(demo);
  const[query,setQuery]=useState('');
  const[selected,setSelected]=useState(null);
  const[searchOpen,setSearchOpen]=useState(false);
  const[filterOpen,setFilterOpen]=useState(false);
  const[activeFilter,setActiveFilter]=useState('');
  const[dateFrom,setDateFrom]=useState('');
  const[dateTo,setDateTo]=useState('');
  const[dateMonth,setDateMonth]=useState('');
  const[camera,setCamera]=useState(false);
  const[busy,setBusy]=useState(false);
  const[zoom,setZoom]=useState(.2);
  const[offset,setOffset]=useState({x:0,y:0});
  const fileRef=useRef(),videoRef=useRef(),streamRef=useRef();
  const pointers=useRef(new Map()),panRef=useRef(null),pinchRef=useRef(null);
  const userInteracted=useRef(false);

  useEffect(()=>{
    if(!authed)return;
    fetch(API+'/photos?limit=200').then(r=>r.ok?r.json():[]).then(rows=>{
      if(rows.length)setPhotos(rows.map(p=>({...p,src:p.preview_key?'/media/'+p.preview_key:null,date:(p.captured_at||p.created_at||'').slice(0,10),tag:p.tags||'',caption:p.caption||'',ratio:p.width&&p.height?p.width/p.height:1})));
    }).catch(()=>{});
  },[authed]);

  const visible=useMemo(()=>photos.filter(p=>{
    const titleMatch=!query||String(p.caption||'').toLowerCase().includes(query.toLowerCase());
    const f=String(activeFilter||'');
    let filterMatch=true;
    if(dateFrom||dateTo||dateMonth){
      const d=String(p.date||'');
      filterMatch=(!dateFrom||d>=dateFrom)&&(!dateTo||d<=dateTo)&&(!dateMonth||d.startsWith(dateMonth));
    }else if(f) filterMatch=String(p.tag||'').toLowerCase()===f.toLowerCase();
    return titleMatch&&filterMatch;
  }),[photos,query,activeFilter]);
  const layout=useMemo(()=>buildCollage(visible),[visible]);

  function fitLayout(nextLayout=layout){
    if(!nextLayout.items.length)return;
    const vw=innerWidth,vh=innerHeight;
    const marginX=48,marginY=150;
    const z=clamp(Math.min((vw-marginX*2)/nextLayout.bounds.w,(vh-marginY*2)/nextLayout.bounds.h),.035,1.25);
    setZoom(z);
    setOffset({x:(vw-nextLayout.bounds.w*z)/2,y:(vh-nextLayout.bounds.h*z)/2+45});
  }

  useEffect(()=>{
    if(!authed||!layout.items.length||userInteracted.current)return;
    const t=setTimeout(()=>fitLayout(layout),90);
    return()=>clearTimeout(t);
  },[authed,photos.length,layout.bounds.w,layout.bounds.h]);

  useEffect(()=>{
    const onResize=()=>{if(!userInteracted.current)fitLayout(layout)};
    addEventListener('resize',onResize);
    return()=>removeEventListener('resize',onResize);
  },[layout]);

  useEffect(()=>{
    if(!searchOpen&&!filterOpen)return;
    const onPointerDown=(e)=>{
      if(!e.target.closest('.toolbar')){
        setSearchOpen(false);
        setFilterOpen(false);
      }
    };
    const onKeyDown=(e)=>{
      if(e.key==='Escape'){
        setSearchOpen(false);
        setFilterOpen(false);
      }
    };
    document.addEventListener('pointerdown',onPointerDown);
    document.addEventListener('keydown',onKeyDown);
    return()=>{
      document.removeEventListener('pointerdown',onPointerDown);
      document.removeEventListener('keydown',onKeyDown);
    };
  },[searchOpen,filterOpen]);

  function login(e){
    e.preventDefault();
    if(password==='04112003'){sessionStorage.setItem('memory-auth','1');setAuthed(true)}
    else alert('Password không đúng');
  }

  function clampZoom(v){return clamp(v,.035,4)}
  function zoomAt(next,clientX,clientY){
    const z=clampZoom(next),rect=document.querySelector('.viewport')?.getBoundingClientRect();
    if(!rect)return;
    const px=clientX-rect.left,py=clientY-rect.top;
    setOffset(o=>({x:px-(px-o.x)*(z/zoom),y:py-(py-o.y)*(z/zoom)}));
    setZoom(z);
  }
  function onWheel(e){e.preventDefault();userInteracted.current=true;zoomAt(zoom*Math.exp(-e.deltaY*.001),e.clientX,e.clientY)}
  function onPointerDown(e){
    userInteracted.current=true;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pointers.current.size===1){
      panRef.current={x:e.clientX,y:e.clientY,startX:offset.x,startY:offset.y};
    }else if(pointers.current.size===2){
      const pts=[...pointers.current.values()];
      const midpoint={x:(pts[0].x+pts[1].x)/2,y:(pts[0].y+pts[1].y)/2};
      pinchRef.current={
        distance:Math.max(1,Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y)),
        zoom,
        midpoint,
        startOffset:{...offset}
      };
      panRef.current=null;
    }
  }
  function onPointerMove(e){
    if(!pointers.current.has(e.pointerId))return;
    pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});

    if(pointers.current.size===2&&pinchRef.current){
      const pts=[...pointers.current.values()];
      const midpoint={x:(pts[0].x+pts[1].x)/2,y:(pts[0].y+pts[1].y)/2};
      const distance=Math.max(1,Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y));
      const scale=clamp(distance/pinchRef.current.distance,.1,10);
      const nextZoom=clampZoom(pinchRef.current.zoom*scale);

      // Keep the exact canvas point under the two-finger midpoint fixed
      // while the midpoint itself moves with the fingers.
      const start={...pinchRef.current};
      const worldX=(start.midpoint.x-start.startOffset.x)/start.zoom;
      const worldY=(start.midpoint.y-start.startOffset.y)/start.zoom;
      setZoom(nextZoom);
      setOffset({
        x:midpoint.x-worldX*nextZoom,
        y:midpoint.y-worldY*nextZoom
      });
      return;
    }

    if(panRef.current&&pointers.current.size===1){
      setOffset({
        x:panRef.current.startX+(e.clientX-panRef.current.x),
        y:panRef.current.startY+(e.clientY-panRef.current.y)
      });
    }
  }
  function onPointerUp(e){pointers.current.delete(e.pointerId);if(pointers.current.size===0){panRef.current=null;pinchRef.current=null}}

  async function createUpload(file){
    const id=crypto.randomUUID(),meta={id,mimeType:file.type||'image/jpeg',sizeBytes:file.size,width:null,height:null,caption:file.name};
    const r=await fetch(API+'/uploads',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(meta)});
    if(!r.ok)throw Error('upload-init failed');
    const data=await r.json();
    await fetch(data.uploadUrl,{method:'PUT',headers:{'content-type':meta.mimeType},body:file});
    await fetch(API+'/uploads/complete',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id,sizeBytes:file.size,caption:file.name})});
    return{id,src:URL.createObjectURL(file),ratio:1,date:new Date().toISOString().slice(0,10),tag:'upload',caption:file.name};
  }
  async function upload(e){
    setBusy(true);
    try{const added=[];for(const f of [...e.target.files])added.push(await createUpload(f));setPhotos(x=>[...added,...x])}
    catch(err){alert('Upload chưa hoàn tất: '+err.message)}
    finally{setBusy(false);e.target.value=''}
  }
  async function startCamera(){
    try{
      const s=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment',width:{ideal:2160},height:{ideal:3840}},audio:false});
      streamRef.current=s;setCamera(true);requestAnimationFrame(()=>{if(videoRef.current){videoRef.current.srcObject=s;videoRef.current.play()}})
    }catch{alert('Không thể mở camera. Hãy cấp quyền camera.')}
  }
  function stopCamera(){streamRef.current?.getTracks().forEach(t=>t.stop());streamRef.current=null;setCamera(false)}
  function capture(){
    const v=videoRef.current,c=document.createElement('canvas');c.width=Math.min(v.videoWidth,2400);c.height=Math.round(c.width*v.videoHeight/v.videoWidth);
    c.getContext('2d').drawImage(v,0,0,c.width,c.height);
    c.toBlob(async b=>{const file=new File([b],'memory-'+Date.now()+'.jpg',{type:'image/jpeg'});try{const item=await createUpload(file);setPhotos(x=>[item,...x])}catch{alert('Không thể lưu ảnh')}stopCamera()},'image/jpeg',.88);
  }

  if(!authed)return <main className="gate"><div className="gate-card"><div className="mark">♡</div><p className="eyebrow">CHÀ BÔNG SPACE</p><h1>our little<br/><i>memory</i></h1><p className="muted">một nơi chỉ dành cho những điều mình muốn giữ lại.</p><form onSubmit={login}><input autoFocus type="password" placeholder="password" value={password} onChange={e=>setPassword(e.target.value)}/><button className="icon-button" aria-label="Enter" title="Enter"><Icon name="enter"/></button></form><small className="scaffold">50 demo memories · preview mode</small></div></main>;

  return <main className="app">
    <header><div className="count">{visible.length}</div><div className="actions"><button className="icon-button" disabled={busy} onClick={()=>fileRef.current.click()} aria-label="Add photos" title="Add photos"><Icon name="plus"/></button><button className="icon-button" onClick={startCamera} aria-label="Camera" title="Camera"><Icon name="camera"/></button><input ref={fileRef} hidden type="file" accept="image/*" multiple onChange={upload}/></div></header>
    <div className="canvas-controls"><button className="icon-button" onClick={()=>fitLayout()} aria-label="Fit canvas" title="Fit canvas"><Icon name="fit"/></button></div>
    <section className="toolbar"><div className="tool-row"><button className="icon-button" onClick={()=>{setSearchOpen(v=>!v);setFilterOpen(false)}} aria-label="Search" title="Search"><Icon name="search"/></button><div className="filter-wrap"><button className="icon-button" onClick={()=>{setFilterOpen(v=>!v);setSearchOpen(false)}} aria-label="Filter" title="Filter"><Icon name="filter"/></button>{filterOpen&&<div className="filters"><button className="clear-filter" onClick={()=>{setDateFrom('');setDateTo('');setDateMonth('');setActiveFilter('')}}>Clear filter</button><div className="filter-section date-filter"><span>Date</span><div className="range-calendar"><label><small>From</small><input type="date" value={dateFrom} onChange={e=>{setDateFrom(e.target.value);setDateMonth('')}}/></label><label><small>To</small><input type="date" value={dateTo} min={dateFrom||undefined} onChange={e=>{setDateTo(e.target.value);setDateMonth('')}}/></label></div></div><div className="filter-section"><span>Albums & tags</span><button onClick={()=>{setActiveFilter('us');setFilterOpen(false)}}>us</button><button onClick={()=>{setActiveFilter('trip');setFilterOpen(false)}}>trip</button><button onClick={()=>{setActiveFilter('home');setFilterOpen(false)}}>home</button></div></div>}</div></div>{searchOpen&&<div className="search-row"><input autoFocus value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search title…"/></div>}</section>
    <section className="viewport" onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
      <div className="world" style={{transform:`translate3d(${offset.x}px,${offset.y}px,0) scale(${zoom})`}}>
        {visible.map((p,i)=>{const pos=layout.items[i];return <article key={p.id} className="photo" style={{left:pos.x,top:pos.y,width:pos.w}} onClick={e=>{e.stopPropagation();setSelected(p)}}><img src={p.src} loading="lazy" decoding="async" draggable="false" onLoad={e=>{const r=e.currentTarget.naturalWidth/e.currentTarget.naturalHeight;if(Number.isFinite(r)&&Math.abs((p.ratio||1)-r)>.01)setPhotos(xs=>xs.map(x=>x.id===p.id?{...x,ratio:r}:x))}}/></article>})}
      </div>
    </section>
    {selected&&<div className="lightbox" onClick={()=>setSelected(null)}><img src={selected.src}/><div><b>{selected.caption}</b><small>{selected.date} · {selected.tag}</small></div></div>}
    {camera&&<div className="camera"><video ref={videoRef} playsInline muted/><div><button className="icon-button" onClick={capture} aria-label="Capture" title="Capture"><Icon name="capture"/></button><button className="icon-button" onClick={stopCamera} aria-label="Close camera" title="Close"><Icon name="close"/></button></div></div>}
  </main>
}
createRoot(document.getElementById('app')).render(<App/>);
