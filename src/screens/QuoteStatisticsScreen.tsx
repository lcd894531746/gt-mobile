import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { PageScaffold } from '../components/PageScaffold';
import { fetchQuoteData } from '../services/api';
import { mergeQuotesByOrderNo, numberFromRecord } from '../utils/mergeQuotesByOrderNo';

type QuoteRecord = Record<string, unknown>;

function normalizeList(raw: unknown): QuoteRecord[] {
  if (Array.isArray(raw)) return raw as QuoteRecord[];
  if (raw && typeof raw === 'object') {
    const data = (raw as { data?: unknown }).data;
    if (Array.isArray(data)) return data as QuoteRecord[];
  }
  return [];
}

function monthFromRecord(record: QuoteRecord): string {
  const dateRaw = record['日期'] ?? record.date ?? record.createdAt ?? record['创建时间'] ?? '';
  const text = String(dateRaw);
  return text.length >= 7 ? text.slice(0, 7) : '未知月份';
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

export function QuoteStatisticsScreen() {
  const [startDate, setStartDate] = useState(() => formatDate(startOfMonth(new Date())));
  const [endDate, setEndDate] = useState(() => formatDate(endOfMonth(new Date())));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);
  const [topMonth, setTopMonth] = useState('-');

  const handleCalc = async () => {
    setLoading(true);
    setError(null);
    try {
      const raw = await fetchQuoteData({
        startDate: startDate.trim(),
        endDate: endDate.trim(),
      });
      const list = mergeQuotesByOrderNo(normalizeList(raw));
      setTotalCount(list.length);

      let amount = 0;
      const monthSummary: Record<string, number> = {};
      for (const item of list) {
        const rowAmount = numberFromRecord(item);
        const month = monthFromRecord(item);
        amount += rowAmount;
        monthSummary[month] = (monthSummary[month] || 0) + rowAmount;
      }
      setTotalAmount(amount);

      const best = Object.entries(monthSummary).sort((a, b) => b[1] - a[1])[0];
      setTopMonth(best ? `${best[0]}（${best[1].toFixed(2)}）` : '-');
    } catch (e) {
      setError(e instanceof Error ? e.message : '统计失败');
      setTotalCount(0);
      setTotalAmount(0);
      setTopMonth('-');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageScaffold title="报价统计" description="对应原系统 /quotestatistics，已接入基础统计计算。">
      <View style={styles.card}>
        <TextInput style={styles.input} value={startDate} onChangeText={setStartDate} placeholder="开始日期 YYYY-MM-DD" />
        <TextInput style={styles.input} value={endDate} onChangeText={setEndDate} placeholder="结束日期 YYYY-MM-DD" />
        <Pressable style={styles.button} onPress={() => void handleCalc()} disabled={loading}>
          <Text style={styles.buttonText}>{loading ? '计算中...' : '计算统计'}</Text>
        </Pressable>
        {loading ? <ActivityIndicator style={styles.blockGap} /> : null}
        {error ? <Text style={styles.error}>接口异常：{error}</Text> : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.item}>报价总单数：{totalCount}</Text>
        <Text style={styles.item}>金额合计：{totalAmount.toFixed(2)}</Text>
        <Text style={styles.item}>金额最高月份：{topMonth}</Text>
      </View>
    </PageScaffold>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
  },
  input: {
    borderWidth: 1,
    borderColor: '#dbe1ec',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginBottom: 8,
  },
  button: {
    marginTop: 4,
    backgroundColor: '#2f68ff',
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
  },
  blockGap: {
    marginTop: 10,
  },
  error: {
    marginTop: 10,
    color: '#cc2d2d',
  },
  item: {
    fontSize: 16,
    color: '#182743',
    marginBottom: 6,
  },
});
