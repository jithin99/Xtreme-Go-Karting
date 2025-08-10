
import express from 'express'
import cors from 'cors'
import dayjs from 'dayjs'
import jwt from 'jsonwebtoken'
import { nanoid } from 'nanoid'
import { readJSON, writeJSON } from './store.js'

const app = express()
app.use(cors())
app.use(express.json())

function getSettings(){ return readJSON('settings.json') }
function getProducts(){ return readJSON('products.json') }
function getBookings(){ return readJSON('bookings.json') }

function auth(req,res,next){
  const token = req.headers.authorization?.split(' ')[1]
  if(!token) return res.status(401).json({error:'Missing token'})
  try{ req.user = jwt.verify(token, getSettings().admin.jwtSecret); next() } 
  catch(e){ return res.status(401).json({error:'Invalid token'}) }
}

app.get('/', (req,res)=> res.json({ ok:true, service:'xtreme-api' }))
app.get('/api/products', (req,res)=> res.json(getProducts()))

app.get('/api/availability', (req,res)=>{
  const { productId, variantId, date, qty } = req.query
  const qtyNum = parseInt(qty||'1')
  const prod = getProducts().find(p=>p.id===productId)
  if(!prod) return res.status(400).json({error:'Invalid product'})
  const variant = prod.variants.find(v=>v.id===variantId)
  if(!variant) return res.status(400).json({error:'Invalid variant'})

  const settings = getSettings()
  const isWeekend = [0,6].includes(dayjs(date).day())
  const oh = isWeekend ? settings.openHours.weekend : settings.openHours.weekday
  const start = dayjs(date+' '+oh.open)
  const end = dayjs(date+' '+oh.close)
  const resourceCount = settings.resources[productId] || 1
  const duration = variant.minutes + (settings.buffers[prod.type]||0)

  const bookings = getBookings().filter(b=> dayjs(b.startsAt).isSame(dayjs(date),'day'))
    .flatMap(b=> b.items.map(it=>({productId:it.productId, qty:it.qty, start:dayjs(b.startsAt), end:dayjs(b.endsAt)})))

  const slots=[]; let cursor=start
  while(cursor.add(duration,'minute').isBefore(end) || cursor.add(duration,'minute').isSame(end)){
    const overlapQty = bookings.filter(x=> x.productId===productId && cursor.isBefore(x.end) && cursor.add(duration,'minute').isAfter(x.start)).reduce((a,x)=>a+x.qty,0)
    if((resourceCount - overlapQty) >= qtyNum) slots.push(cursor.format('HH:mm'))
    cursor = cursor.add(30,'minute')
  }
  res.json({ date, productId, variantId, qty:qtyNum, duration, slots })
})

app.post('/api/bookings', (req,res)=>{
  const { customer, items, startTime } = req.body
  if(!customer || !items?.length || !startTime) return res.status(400).json({error:'Invalid payload'})
  const settings = getSettings()
  const products = getProducts()
  let subtotal=0, minutes=0
  for(const it of items){
    const p = products.find(x=>x.id===it.productId); const v = p?.variants.find(v=>v.id===it.variantId)
    if(!v) return res.status(400).json({error:'Invalid item'})
    subtotal += (v.price*it.qty) + (it.gopro?200*it.qty:0); minutes += v.minutes
  }
  const tax = Math.round(subtotal*settings.taxRate); const total = subtotal+tax
  const code = 'XGK-'+nanoid(6).toUpperCase()
  const startsAt = dayjs(startTime).toISOString(); const endsAt = dayjs(startTime).add(minutes,'minute').toISOString()
  const b = { id:nanoid(), code, customer, items, total, tax, status:'confirmed', startsAt, endsAt, checkedIn:false, createdAt:new Date().toISOString() }
  const all = getBookings(); all.push(b); writeJSON('bookings.json', all)
  res.json({ ok:true, booking:b })
})

app.get('/api/bookings/:code', (req,res)=>{
  const b = getBookings().find(x=> x.code === req.params.code.toUpperCase())
  if(!b) return res.status(404).json({error:'Not found'})
  res.json(b)
})

app.post('/api/staff/checkin', (req,res)=>{
  const { code } = req.body
  const all = getBookings(); const i = all.findIndex(x=> x.code===code)
  if(i<0) return res.status(404).json({error:'Not found'})
  all[i].checkedIn = true; writeJSON('bookings.json', all)
  res.json({ ok:true, booking: all[i] })
})

app.post('/api/auth/login', (req,res)=>{
  const { email, password } = req.body
  const a = getSettings().admin
  if(email===a.email && password===a.password){
    const token = jwt.sign({ role:'admin', email }, a.jwtSecret, { expiresIn:'8h' })
    return res.json({ token })
  }
  res.status(401).json({error:'Invalid credentials'})
})

const PORT = process.env.PORT || 4000
app.listen(PORT, ()=> console.log('xtreme-api listening on http://localhost:'+PORT))
