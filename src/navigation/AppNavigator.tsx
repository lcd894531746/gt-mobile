import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NavigationContainer, DefaultTheme, useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { MainStackParamList, MainTabParamList, RootStackParamList } from '../types/navigation';
import { useAuth } from '../context/AuthContext';
import { LoginScreen } from '../screens/LoginScreen';
import { DataDashScreen } from '../screens/DataDashScreen';
import { OfferScreen } from '../screens/OfferScreen';
import { DesScreen } from '../screens/DesScreen';
import { CusScreen } from '../screens/CusScreen';
import { EmpScreen } from '../screens/EmpScreen';
import { PrintTemplateEditorScreen } from '../screens/PrintTemplateEditorScreen';
import { QuoteStatisticsScreen } from '../screens/QuoteStatisticsScreen';
import { FloatingSettingsMenu } from '../components/FloatingSettingsMenu';

const Stack = createNativeStackNavigator<RootStackParamList>();
const MainStack = createNativeStackNavigator<MainStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

const stackChildHeaderOptions = {
  headerShown: true as const,
  headerTintColor: '#204dff',
  headerStyle: { backgroundColor: '#f3f5f9' },
  headerShadowVisible: false as const,
};

function CustomerStackScreen() {
  return <CusScreen embedInStackHeader />;
}

function EmployeeStackScreen() {
  return <EmpScreen embedInStackHeader />;
}

function MainTabs() {
  const { signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const mainNavigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();

  return (
    <View style={styles.tabShell}>
      <View style={[styles.topBar, { paddingTop: Math.max(insets.top, 8) }]}>
        <Pressable onPress={() => void signOut()} style={styles.logoutPressable} hitSlop={8}>
          <Text style={styles.logoutLabel}>退出</Text>
        </Pressable>
      </View>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: '#204dff',
          tabBarInactiveTintColor: '#64748b',
          tabBarLabelStyle: {
            fontSize: 13,
            fontWeight: '600',
            marginBottom: 2,
          },
          tabBarIconStyle: {
            marginTop: 4,
            marginBottom: 5,
          },
          tabBarStyle: {
            backgroundColor: '#ffffff',
            borderTopColor: '#e2e8f0',
            borderTopWidth: StyleSheet.hairlineWidth,
            paddingTop: 4,
            paddingBottom: Math.max(insets.bottom, 8),
            height: 56 + Math.max(insets.bottom, 8),
          },
          tabBarIcon: ({ color, focused }) => {
            const size = 24;
            const name =
              route.name === 'DataDash'
                ? focused
                  ? 'stats-chart'
                  : 'stats-chart-outline'
                : route.name === 'Offer'
                  ? focused
                    ? 'document-text'
                    : 'document-text-outline'
                  : route.name === 'Des'
                    ? focused
                      ? 'cube'
                      : 'cube-outline'
                    : 'ellipse-outline';
            return <Ionicons name={name} size={size} color={color} />;
          },
        })}
      >
        <Tab.Screen name="DataDash" component={DataDashScreen} options={{ title: '总览' }} />
        <Tab.Screen name="Offer" component={OfferScreen} options={{ title: '报价' }} />
        <Tab.Screen name="Des" component={DesScreen} options={{ title: '产品' }} />
      </Tab.Navigator>
      <FloatingSettingsMenu
        onTemplate={() => mainNavigation.navigate('PrintTemplateEditor')}
        onQuoteStatistics={() => mainNavigation.navigate('QuoteStatistics')}
        onCustomer={() => mainNavigation.navigate('Customer')}
        onEmployee={() => mainNavigation.navigate('Employee')}
      />
    </View>
  );
}

function MainFlow() {
  return (
    <MainStack.Navigator screenOptions={{ headerShown: false }}>
      <MainStack.Screen name="Tabs" component={MainTabs} />
      <MainStack.Screen
        name="PrintTemplateEditor"
        component={PrintTemplateEditorScreen}
        options={{
          ...stackChildHeaderOptions,
          title: '模板',
        }}
      />
      <MainStack.Screen
        name="QuoteStatistics"
        component={QuoteStatisticsScreen}
        options={{
          ...stackChildHeaderOptions,
          title: '报价统计',
        }}
      />
      <MainStack.Screen
        name="Customer"
        component={CustomerStackScreen}
        options={{
          ...stackChildHeaderOptions,
          title: '客户',
        }}
      />
      <MainStack.Screen
        name="Employee"
        component={EmployeeStackScreen}
        options={{
          ...stackChildHeaderOptions,
          title: '员工',
        }}
      />
    </MainStack.Navigator>
  );
}

export function AppNavigator() {
  const { isReady, isAuthenticated } = useAuth();

  if (!isReady) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>正在初始化系统...</Text>
      </View>
    );
  }

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {isAuthenticated ? (
          <Stack.Screen name="Main" component={MainFlow} />
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: '#f3f5f9',
  },
};

const styles = StyleSheet.create({
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    color: '#2b3957',
  },
  tabShell: {
    flex: 1,
    backgroundColor: '#f3f5f9',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 4,
    backgroundColor: '#f3f5f9',
  },
  logoutPressable: {
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  logoutLabel: {
    color: '#2f68ff',
    fontWeight: '600',
    fontSize: 15,
  },
});
