export type RootStackParamList = {
  Login: undefined;
  Main: undefined;
};

/** 登录后主流程：底部 Tabs + 模板 / 报价统计 / 客户 / 员工等 Stack 页 */
export type MainStackParamList = {
  Tabs: undefined;
  PrintTemplateEditor: undefined;
  QuoteStatistics: undefined;
  Customer: undefined;
  Employee: undefined;
  QuoteDetailFullscreen: {
    list: Record<string, unknown>[];
  };
};

export type MainTabParamList = {
  DataDash: undefined;
  Offer: undefined;
  Des: undefined;
};
