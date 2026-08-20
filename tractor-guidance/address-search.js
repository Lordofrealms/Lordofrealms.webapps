(()=>{
  function installTractorAddressSearch(){
    if(window.__TRACTOR_ADDRESS_SEARCH_INSTALLED)return true;
    const input=document.getElementById('addressSearch'),btn=document.getElementById('addressSearchBtn'),msg=document.getElementById('searchMsg'),clear=document.getElementById('clearSearchMarker');
    if(!input||!btn||!msg)return false;
    window.__TRACTOR_ADDRESS_SEARCH_INSTALLED=true;
    let marker=null,aborter=null;
    function setMsg(t,err=false){msg.textContent=t;msg.style.color=err?'#ff9d8f':''}
    function getMap(){try{return typeof map!=='undefined'?map:null}catch(e){return null}}
    function clearMarker(){try{marker?.remove()}catch(e){}marker=null;setMsg('')}
    async function searchAddress(){
      const q=input.value.trim();if(!q){setMsg('Enter a U.S. address to search.',true);return}
      if(aborter)aborter.abort();aborter=new AbortController();btn.disabled=true;setMsg('Searching address…');
      try{
        const u=new URL('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress');u.searchParams.set('address',q);u.searchParams.set('benchmark','Public_AR_Current');u.searchParams.set('format','json');
        const r=await fetch(u.toString(),{signal:aborter.signal,headers:{Accept:'application/json'}});if(!r.ok)throw new Error(`Census geocoder HTTP ${r.status}`);
        const data=await r.json(),matches=data?.result?.addressMatches||[];if(!matches.length){setMsg('No matching U.S. address found.',true);return}
        const m=matches[0],x=Number(m?.coordinates?.x),y=Number(m?.coordinates?.y);if(!Number.isFinite(x)||!Number.isFinite(y))throw new Error('Geocoder returned invalid coordinates.');
        const mp=getMap();if(!mp)throw new Error('Map is not ready yet.');
        try{marker?.remove()}catch(e){}
        if(window.maplibregl?.Marker)marker=new maplibregl.Marker({color:'#4db7ff'}).setLngLat([x,y]).addTo(mp);
        if(typeof mp.flyTo==='function')mp.flyTo({center:[x,y],zoom:18,essential:true});else if(typeof mp.jumpTo==='function')mp.jumpTo({center:[x,y],zoom:18});
        const label=m?.matchedAddress||q;setMsg(`Found: ${label}`);
      }catch(e){if(e?.name==='AbortError')return;console.error('Address search failed',e);setMsg(`Address search failed: ${e?.message||e}`,true)}finally{btn.disabled=false}
    }
    btn.onclick=searchAddress;input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();searchAddress()}});if(clear)clear.onclick=clearMarker;
    window.TractorAddressSearch={search:searchAddress,clear:clearMarker};return true;
  }
  window.installTractorAddressSearch=installTractorAddressSearch;
})();