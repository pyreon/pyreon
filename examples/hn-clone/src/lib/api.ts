/**
 * Hacker News API client.
 *
 * Uses the HNPWA edge-cached API (https://github.com/tastejs/hacker-news-pwas).
 * It returns enriched objects (title, author, comment count) — far easier to
 * work with than the raw Firebase HN API which requires recursive item fetches.
 */

const BASE = 'https://api.hnpwa.com/v0'

export type FeedKind = 'news' | 'newest' | 'ask' | 'show' | 'jobs'

export interface Story {
  id: number
  title: string
  points: number | null
  user: string | null
  time: number
  time_ago: string
  comments_count: number
  type: 'link' | 'job' | 'ask' | 'comment' | 'pollopt'
  url: string
  domain?: string
  content?: string
}

export interface Comment {
  id: number
  level: number
  user: string | null
  time: number
  time_ago: string
  content: string
  comments: Comment[]
}

export interface ItemDetail extends Story {
  comments: Comment[]
  parent?: number
  poll?: number | null
  deleted?: boolean
  dead?: boolean
}

export interface User {
  id: string
  created: string
  created_time: number
  karma: number
  about?: string
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) {
    throw new Error(`HN API ${res.status}: ${path}`)
  }
  return (await res.json()) as T
}

export async function fetchFeed(kind: FeedKind, page: number): Promise<Story[]> {
  return fetchJson<Story[]>(`/${kind}/${page}.json`)
}

export async function fetchItem(id: number | string): Promise<ItemDetail> {
  return fetchJson<ItemDetail>(`/item/${id}.json`)
}

export async function fetchUser(id: string): Promise<User> {
  return fetchJson<User>(`/user/${id}.json`)
}
