import { Text } from 'react-native';
import { PageScaffold } from '../components/PageScaffold';

export function PrintTemplateEditorScreen() {
  return (
    <PageScaffold
      title="打印模板"
      description="对应原系统 /printtemplateeditor。移动端会改为模板管理 + 预览 + AirPrint/系统分享导出。"
    >
      <Text>已完成模块入口，下一步接模板字段和渲染引擎。</Text>
    </PageScaffold>
  );
}
