export interface PostData {
  cleanedText: string;
  title: string;
  question: string;
  hashtags: string[];
}

export interface Trend {
  topic: string;
  desc: string;
  hashtags: string[];
  imageUrl: string;
}