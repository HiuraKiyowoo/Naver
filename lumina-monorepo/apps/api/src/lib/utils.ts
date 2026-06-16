import axios, { type AxiosRequestConfig } from 'axios'

export const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept': 'application/json, text/plain, */*',
}

export async function fetchJson<T = unknown>(url: string, options?: AxiosRequestConfig): Promise<T> {
  const res = await axios<T>({ url, method: 'GET', headers: { ...DEFAULT_HEADERS, ...options?.headers }, timeout: 15000, ...options })
  return res.data
}

export async function fetchHtml(url: string, options?: AxiosRequestConfig): Promise<string> {
  const res = await axios<string>({ url, method: 'GET', headers: { ...DEFAULT_HEADERS, Accept: 'text/html', ...options?.headers }, responseType: 'text', timeout: 15000, ...options })
  return res.data
}

export async function postJson<T = unknown>(url: string, data: unknown, options?: AxiosRequestConfig): Promise<T> {
  const res = await axios<T>({ url, method: 'POST', headers: { ...DEFAULT_HEADERS, 'Content-Type': 'application/json', ...options?.headers }, data, timeout: 15000, ...options })
  return res.data
}

export function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

export function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
