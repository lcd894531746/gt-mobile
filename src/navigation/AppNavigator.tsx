import { Ionicons } from '@expo/vector-icons';
import { DefaultTheme, NavigationContainer, useNavigation } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FloatingSettingsMenu } from '../components/FloatingSettingsMenu';
import { useAuth } from '../context/AuthContext';
import { CusScreen } from '../screens/CusScreen';
import { DataDashScreen } from '../screens/DataDashScreen';
import { DesScreen } from '../screens/DesScreen';
import { EmpScreen } from '../screens/EmpScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { OfferScreen } from '../screens/OfferScreen';
import { PrintTemplateEditorScreen } from '../screens/PrintTemplateEditorScreen';
import { QuoteDetailFullscreenScreen } from '../screens/QuoteDetailFullscreenScreen';
import { QuoteStatisticsScreen } from '../screens/QuoteStatisticsScreen';
import type { MainStackParamList, MainTabParamList, RootStackParamList } from '../types/navigation';

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
  const insets = useSafeAreaInsets();
  const mainNavigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();

  return (
    <View style={styles.tabShell}>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: true,
          headerTitleAlign: 'center',
          headerStatusBarHeight: Math.max(insets.top - 10, 0),
          headerStyle: {
            backgroundColor: '#f3f5f9',
            height: 52,
          },
          headerTintColor: '#102248',
          headerTitleStyle: {
            fontSize: 18,
            fontWeight: '700',
          },
          headerShadowVisible: false,
          tabBarHideOnKeyboard: false,
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
            paddingTop: 6,
            paddingBottom: Math.max(insets.bottom, 10),
            height: 62 + Math.max(insets.bottom, 10),
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

function PrintTemplateStackScreen() {
  return <PrintTemplateEditorScreen embedInStackHeader />;
}

function MainFlow() {
  return (
    <MainStack.Navigator screenOptions={{ headerShown: false }}>
      <MainStack.Screen name="Tabs" component={MainTabs} />
      <MainStack.Screen
        name="PrintTemplateEditor"
        component={PrintTemplateStackScreen}
        options={{
          ...stackChildHeaderOptions,
          title: '打印模板',
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
          title: '客户管理',
        }}
      />
      <MainStack.Screen
        name="Employee"
        component={EmployeeStackScreen}
        options={{
          ...stackChildHeaderOptions,
          title: '员工管理',
        }}
      />
      <MainStack.Screen
        name="QuoteDetailFullscreen"
        component={QuoteDetailFullscreenScreen}
        options={{
          headerShown: false,
          presentation: 'fullScreenModal',
          orientation: 'landscape',
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
});
