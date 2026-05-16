import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../context/AuthContext';
import { getSavedUsername } from '../services/storage';

export function LoginScreen() {
  const { signIn } = useAuth();
  const [username, setUsername] = useState('纪勇');
  const [password, setPassword] = useState('123456');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const saved = await getSavedUsername();
      setUsername(saved || '纪勇');
    })();
  }, []);

  const handleLogin = async () => {
    try {
      setLoading(true);
      await signIn({ username: username.trim(), password });
    } catch (error) {
      const message = error instanceof Error ? error.message : '登录失败';
      Alert.alert('登录失败', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <StatusBar style="light" />
      <View style={styles.container}>
        <View style={styles.card}>
        <Text style={styles.title}>报价管理系统</Text>
        <Text style={styles.subtitle}>移动端登录</Text>

        <Text style={styles.label}>账号</Text>
        <TextInput value={username} onChangeText={setUsername} style={styles.input} autoCapitalize="none" />

        <Text style={styles.label}>密码</Text>
        <TextInput value={password} onChangeText={setPassword} style={styles.input} secureTextEntry />

        <Pressable
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>登录</Text>}
        </Pressable>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f1d3d',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 12,
    backgroundColor: '#fff',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1a2440',
  },
  subtitle: {
    marginTop: 8,
    marginBottom: 18,
    color: '#5d6a86',
  },
  label: {
    fontSize: 13,
    color: '#4d5b79',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#dbe1ec',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  button: {
    backgroundColor: '#2f68ff',
    borderRadius: 8,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
  },
});
