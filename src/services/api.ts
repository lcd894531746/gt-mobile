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

/** 员工列表；与桌面端一致：`GET /emp?query=` */
export async function fetchEmployees(query = '') {
  const { data } = await api.get('/emp', { params: { query } });
  return data;
}

/** 桌面端：`POST /emp`，`员工密码` 为 MD5 摘要 */
export async function addEmployee(payload: {
  员工姓名: string;
  账号: string;
  员工密码: string;
  员工电话: string;
  职位: string;
}) {
  const { data } = await api.post('/emp', payload);
  return data;
}

/** 桌面端：`PUT /emp/:id` */
export async function updateEmployee(
  id: string | number,
  payload: {
    员工姓名: string;
    账号: string;
    员工电话: string;
    职位: string;
  },
) {
  const { data } = await api.put(`/emp/${encodeURIComponent(String(id))}`, payload);
  return data;
}

/** 桌面端：`PUT /emp/:id/password`，body `{ 新密码: md5 }` */
export async function updateEmployeePassword(id: string | number, newPasswordMd5: string) {
  const { data } = await api.put(`/emp/${encodeURIComponent(String(id))}/password`, {
    新密码: newPasswordMd5,
  });
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

/** 与 updateCustomer 路径风格一致；若后端路由不同请改此处 */
export async function deleteCustomer(id: string | number) {
  const { data } = await api.delete(`/deleteCustomer/${encodeURIComponent(String(id))}`);
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

/** Electron 桌面端走本地目录；若服务端仍提供旧接口则可拉取列表（失败返回 null） */
export async function fetchRemotePrintTemplateNames(): Promise<string[] | null> {
  try {
    const { data } = await api.get<unknown>('/getPrintTemplateFiles');
    if (Array.isArray(data)) return data.map((x) => String(x));
    if (data && typeof data === 'object' && Array.isArray((data as { data?: unknown }).data)) {
      return (data as { data: unknown[] }).data.map((x) => String(x));
    }
    return [];
  } catch {
    return null;
  }
}

/** 尝试路径参数或查询参数，兼容不同后端写法 */
export async function fetchRemoteTemplateConfig(templateName: string): Promise<unknown | null> {
  try {
    const { data } = await api.get(`/getTemplateConfig/${encodeURIComponent(templateName)}`);
    return data;
  } catch {
    try {
      const { data } = await api.get('/getTemplateConfig', {
        params: { name: templateName, templateName },
      });
      return data;
    } catch {
      return null;
    }
  }
}

export { api };
