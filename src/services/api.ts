import axios from 'axios';
import md5 from 'md5';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../config/env';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
});

export function setApiToken(token?: string) {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
}

api.interceptors.request.use(async (config) => {
  if (!config.headers?.Authorization) {
    const token = await AsyncStorage.getItem('token');
    if (token) {
      config.headers = config.headers ?? {};
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

export interface LoginResponse {
  success?: boolean;
  token?: string;
  user?: unknown;
  message?: string;
  data?: {
    token?: string;
    name?: string;
    id?: number | string;
    [key: string]: unknown;
  };
}

export async function loginByApi(username: string, plainPassword: string): Promise<LoginResponse> {
  const payload = {
    username,
    password: md5(plainPassword),
  };
  const { data } = await api.post<LoginResponse>('/login', payload);
  return {
    ...data,
    token: data?.token ?? data?.data?.token,
    user: data?.user ?? data?.data,
    success: Boolean(data?.success),
    message: data?.message,
  };
}

export async function fetchEmployees() {
  const { data } = await api.get('/emp');
  return data;
}

export async function fetchQuoteData(params: {
  startDate?: string;
  endDate?: string;
  /** 与桌面端一致：选定客户时传给后端，不传则查询全部客户 */
  customerId?: string | number | null;
}) {
  const q: Record<string, string> = {};
  if (params.startDate != null && String(params.startDate).trim() !== '') {
    q.startDate = String(params.startDate).trim();
  }
  if (params.endDate != null && String(params.endDate).trim() !== '') {
    q.endDate = String(params.endDate).trim();
  }
  if (params.customerId != null && String(params.customerId).trim() !== '') {
    const v = String(params.customerId).trim();
    q.customerId = v;
    // 部分后端只认中文查询参数，与报价创建载荷「客户ID」对齐
    q['客户ID'] = v;
  }
  const { data } = await api.get('/getQuoteData', { params: q });
  return data;
}

export async function fetchQuoteDetail(orderNo: string) {
  const { data } = await api.get(`/getQuoteDetail/${encodeURIComponent(orderNo)}`);
  return data;
}

/** 桌面端报价页 Drawer 数据源：GET /getUnshippedQuotes */
export async function fetchUnshippedQuotes() {
  const { data } = await api.get('/getUnshippedQuotes');
  return data;
}

export async function createQuote(payload: Record<string, unknown>) {
  const { data } = await api.post('/createQuote', payload);
  return data;
}

export async function updateQuoteStatus(orderNo: string, payload: Record<string, unknown>) {
  const { data } = await api.put(`/updateQuoteStatus/${encodeURIComponent(orderNo)}`, payload);
  return data;
}

export async function deleteQuote(orderNo: string) {
  const { data } = await api.delete(`/deleteQuote/${encodeURIComponent(orderNo)}`);
  return data;
}

export async function searchCustomer(query: string) {
  const { data } = await api.get('/searchCustomer', { params: { query } });
  return data;
}

export async function addCustomer(payload: Record<string, unknown>) {
  const { data } = await api.post('/addCustomer', payload);
  return data;
}

export async function updateCustomer(id: string | number, payload: Record<string, unknown>) {
  const { data } = await api.put(`/updateCustomer/${encodeURIComponent(String(id))}`, payload);
  return data;
}

export async function getFormulas() {
  const { data } = await api.get('/getFormulas');
  return data;
}

export async function addFormula(payload: Record<string, unknown>) {
  const { data } = await api.post('/addFormula', payload);
  return data;
}

export async function updateFormula(payload: Record<string, unknown>) {
  const { data } = await api.put('/updateFormula', payload);
  return data;
}

export async function deleteFormula(name: string) {
  const { data } = await api.delete(`/deleteFormula/${encodeURIComponent(name)}`);
  return data;
}

export { api };
