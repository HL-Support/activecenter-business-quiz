import { NextResponse } from 'next/server'

const BASE = process.env.MAUTIC_BASE || 'https://mautic.hl-support.biz'
const AUTH = Buffer.from(`admin:${process.env.MAUTIC_PASS || ''}`).toString('base64')

export async function GET(request, { params }) {
  const id = params.id
  const res = await fetch(`${BASE}/api/emails/${id}`, {
    headers: { Authorization: `Basic ${AUTH}` },
    cache: 'no-store',
  })
  if (!res.ok) return NextResponse.json({ error: `Mautic ${res.status}` }, { status: res.status })
  const data = await res.json()
  return NextResponse.json({
    html: data.email?.customHtml || '',
    name: data.email?.name || '',
    subject: data.email?.subject || '',
  })
}

export async function PATCH(request, { params }) {
  const id = params.id
  const { html } = await request.json()
  const res = await fetch(`${BASE}/api/emails/${id}/edit`, {
    method: 'PATCH',
    headers: {
      Authorization: `Basic ${AUTH}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ customHtml: html }),
  })
  if (!res.ok) {
    const err = await res.text()
    return NextResponse.json({ ok: false, error: err.slice(0, 200) }, { status: res.status })
  }
  const data = await res.json()
  return NextResponse.json({ ok: !!data.email })
}
