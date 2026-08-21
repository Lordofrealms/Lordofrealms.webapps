(()=>{
  function installTractorAddressSearch(){
    if(window.__TRACTOR_ADDRESS_SEARCH_INSTALLED)return true;
    const input=document.getElementById('addressSearch'),btn=document.getElementById('addressSearchBtn'),msg=document.getElementById('searchMsg'),clear=document.getElementById('clearSearchMarker');
    if(!input||!btn||!msg)return false;
    window.__TRACTOR_ADDRESS_SEARCH_INSTALLED=true;
    let marker=null,pendingScript=null,pendingCallback=null;
    function setMsg(t,err=false){msg.textContent=t;msg.style.color=err?'#ff9d8f':''}
    function getMap(){try{return typeof map!=='undefined'?map:null}catch(e){return null}}
    function clearMarker(){try{marker?.remove()}catch(e){}marker=null;setMsg('')}
    function cleanup(){if(pendingScript){try{pendingScript.remove()}catch(e){}pendingScript=null}if(pendingCallback){try{delete window[pendingCallback]}catch(e){window[pendingCallback]=undefined}pendingCallback=null}}
    function censusJsonp(q){return new Promise((resolve,reject)=>{cleanup();const cb='__tractorCensus_'+Date.now()+'_'+Math.random().toString(36).slice(2);pendingCallback=cb;const s=document.createElement('script');pendingScript=s;const timer=setTimeout(()=>{cleanup();reject(new Error('Census geocoder timed out'))},12000);window[cb]=data=>{clearTimeout(timer);cleanup();resolve(data)};s.onerror=()=>{clearTimeout(timer);cleanup();reject(new Error('Census geocoder could not be reached'))};const u=new URL('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress');u.searchParams.set('address',q);u.searchParams.set('benchmark','Public_AR_Current');u.searchParams.set('format','jsonp');u.searchParams.set('callback',cb);s.src=u.toString();s.async=true;document.head.appendChild(s)})}
    async function searchAddress(){const q=input.value.trim();if(!q){setMsg('Enter a U.S. address to search.',true);return}btn.disabled=true;setMsg('Searching address…');try{const data=await censusJsonp(q),matches=data?.result?.addressMatches||[];if(!matches.length){setMsg('No matching U.S. address found.',true);return}const m=matches[0],x=Number(m?.coordinates?.x),y=Number(m?.coordinates?.y);if(!Number.isFinite(x)||!Number.isFinite(y))throw new Error('Geocoder returned invalid coordinates.');const mp=getMap();if(!mp)throw new Error('Map is not ready yet.');try{marker?.remove()}catch(e){}if(window.maplibregl?.Marker)marker=new maplibregl.Marker({color:'#4db7ff'}).setLngLat([x,y]).addTo(mp);if(typeof mp.flyTo==='function')mp.flyTo({center:[x,y],zoom:18,essential:true});else if(typeof mp.jumpTo==='function')mp.jumpTo({center:[x,y],zoom:18});setMsg(`Found: ${m?.matchedAddress||q}`)}catch(e){console.error('Address search failed',e);setMsg(`Address search failed: ${e?.message||e}`,true)}finally{btn.disabled=false}}
    btn.onclick=searchAddress;input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();searchAddress()}});if(clear)clear.onclick=clearMarker;window.TractorAddressSearch={search:searchAddress,clear:clearMarker};return true
  }
  window.installTractorAddressSearch=installTractorAddressSearch;
})();