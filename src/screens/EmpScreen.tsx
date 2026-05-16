import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { PageScaffold } from '../components/PageScaffold';
import { fetchEmployees } from '../services/api';

type EmpScreenProps = {
  embedInStackHeader?: boolean;
};

export function EmpScreen({ embedInStackHeader }: EmpScreenProps = {}) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchEmployees();
        const list = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
        const mapped = list.map((item: any, idx: number) => item?.name || item?.员工姓名 || `员工${idx + 1}`);
        setItems(mapped);
      } catch (e) {
        setError(e instanceof Error ? e.message : '加载失败');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <PageScaffold
      title={embedInStackHeader ? undefined : '员工管理'}
      description={embedInStackHeader ? undefined : '对应原系统 /emp，已接入 /emp 接口读取列表。'}
    >
      <View style={styles.card}>
        {loading ? <ActivityIndicator /> : null}
        {!loading && error ? <Text style={styles.error}>接口异常：{error}</Text> : null}
        {!loading && !error ? (
          <FlatList
            data={items}
            keyExtractor={(item, index) => `${item}-${index}`}
            renderItem={({ item }) => <Text style={styles.item}>{item}</Text>}
            ListEmptyComponent={<Text>暂无员工数据</Text>}
          />
        ) : null}
      </View>
    </PageScaffold>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    minHeight: 160,
  },
  item: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#dce1ea',
  },
  error: {
    color: '#cc2d2d',
  },
});
