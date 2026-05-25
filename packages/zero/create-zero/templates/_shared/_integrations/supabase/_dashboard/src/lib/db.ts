import { supabase } from './supabase'

/**
 * Supabase-backed data layer. Mirrors the in-memory stub's exported
 * surface (User / Invoice / listUsers / listInvoices / invoiceById /
 * invoiceTotal) so dashboard routes don't change when swapping backends.
 *
 * Schema expected in your Supabase Postgres:
 *
 *   create table public.users (
 *     id uuid primary key,
 *     email text not null,
 *     name text not null,
 *     role text not null check (role in ('admin','member')),
 *     created_at timestamptz not null default now()
 *   );
 *
 *   create table public.invoices (
 *     id text primary key,
 *     number text not null,
 *     customer jsonb not null,
 *     items jsonb not null,
 *     status text not null check (status in ('draft','pending','paid')),
 *     issued_at timestamptz not null default now()
 *   );
 */

export interface User {
  id: string
  email: string
  name: string
  role: 'admin' | 'member'
  createdAt: Date
}

export interface InvoiceItem {
  description: string
  qty: number
  unitPrice: number
}

export interface Invoice {
  id: string
  number: string
  customer: { name: string; email: string; address: string }
  items: InvoiceItem[]
  status: 'draft' | 'pending' | 'paid'
  issuedAt: Date
}

export async function listUsers(): Promise<User[]> {
  const { data, error } = await supabase.from('users').select('*')
  if (error) throw error
  return data.map((row) => ({
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    createdAt: new Date(row.created_at),
  }))
}

export async function listInvoices(): Promise<Invoice[]> {
  const { data, error } = await supabase.from('invoices').select('*')
  if (error) throw error
  return data.map(rowToInvoice)
}

export async function invoiceById(id: string): Promise<Invoice | undefined> {
  const { data, error } = await supabase.from('invoices').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data ? rowToInvoice(data) : undefined
}

export function invoiceTotal(inv: Invoice): number {
  return inv.items.reduce((sum, i) => sum + i.qty * i.unitPrice, 0)
}

function rowToInvoice(row: any): Invoice {
  return {
    id: row.id,
    number: row.number,
    customer: row.customer,
    items: row.items,
    status: row.status,
    issuedAt: new Date(row.issued_at),
  }
}
