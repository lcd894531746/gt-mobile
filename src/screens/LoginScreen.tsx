import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';

export function LoginScreen() {
  const { signIn } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!username.trim() || !password) {
      Alert.alert('提示', '请输入账号和密码');
      return;
    }

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
      <LinearGradient colors={['#081120', '#12305d', '#eef3f8']} locations={[0, 0.5, 1]} style={styles.container}>
        <View style={styles.glowTop} />
        <View style={styles.glowBottom} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardWrap}
        >
          <View style={styles.hero}>
            <Text style={styles.eyebrow}>GT WIN</Text>
            <Text style={styles.heroTitle}>报价管理系统</Text>
            <Text style={styles.heroSubtitle}>移动端业务入口</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>欢迎登录</Text>
            <Text style={styles.cardSubtitle}>输入账号和密码继续访问业务数据</Text>

            <Text style={styles.label}>账号</Text>
            <TextInput
              value={username}
              onChangeText={setUsername}
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="请输入账号"
              placeholderTextColor="#8a94a6"
            />

            <Text style={styles.label}>密码</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              style={styles.input}
              secureTextEntry
              placeholder="请输入密码"
              placeholderTextColor="#8a94a6"
            />

            <Pressable
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>登录</Text>}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </LinearGradient>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
  },
  keyboardWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  glowTop: {
    position: 'absolute',
    top: -90,
    right: -30,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(132, 196, 255, 0.18)',
  },
  glowBottom: {
    position: 'absolute',
    bottom: 120,
    left: -70,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  hero: {
    marginBottom: 18,
    paddingHorizontal: 6,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
    color: 'rgba(255,255,255,0.72)',
    marginBottom: 10,
  },
  heroTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#ffffff',
  },
  heroSubtitle: {
    marginTop: 10,
    fontSize: 15,
    color: 'rgba(255,255,255,0.72)',
  },
  card: {
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.94)',
    paddingHorizontal: 22,
    paddingVertical: 24,
    shadowColor: '#061224',
    shadowOpacity: 0.22,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 14 },
    elevation: 10,
  },
  cardTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#14213d',
  },
  cardSubtitle: {
    marginTop: 8,
    marginBottom: 22,
    fontSize: 14,
    lineHeight: 20,
    color: '#5d6b82',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#41516b',
    marginBottom: 8,
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: '#d8e0ea',
    borderRadius: 16,
    paddingHorizontal: 16,
    fontSize: 15,
    color: '#122033',
    backgroundColor: '#f8fafc',
    marginBottom: 14,
  },
  button: {
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    backgroundColor: '#1f57ff',
    shadowColor: '#1f57ff',
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  buttonDisabled: {
    opacity: 0.75,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
