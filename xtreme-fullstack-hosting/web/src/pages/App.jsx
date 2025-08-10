import React from 'react'
import Home from './Home.jsx'
import Admin from './Admin.jsx'
import Staff from './Staff.jsx'
export default function App(){const [route,setRoute]=React.useState('home');React.useEffect(()=>{const onHash=()=>setRoute(location.hash.replace('#','')||'home');window.addEventListener('hashchange',onHash);onHash();return()=>window.removeEventListener('hashchange',onHash)},[]);return route==='admin'?<Admin/>:route==='staff'?<Staff/>:<Home/>}
