export type CompletionItem = {
  word: string;
  menu: string;
  user_data: string;
  info: string;
  kind: string;
  abbr: string;
};

export type CompletionChangeEvent = {
  col: number;
  row: number;
  scrollbar: boolean;
  completed_item: CompletionItem;
  width: number;
  height: number;
  size: number;
};
