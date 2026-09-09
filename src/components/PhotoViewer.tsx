import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ponytail: RNW Modal 用 aria-hidden + display:none 收合,不清掉內部焦點瀏覽器就
// 擋 aria-hidden 並噴 "Blocked aria-hidden on an element because its descendant retained focus"。
// 關閉時主動 blur;不必做 focus restoration(開啟時 Modal 不會自動搶焦點)。
const blurActive = () => {
  if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
};

type Props = {
  // null = 關閉。有值 = 開啟。
  uri: string | null;
  onClose: () => void;
};

// 全螢幕照片檢視器。結帳台場景:使用者想親眼再次確認標籤照上的價格。
// 黑色背景,expo-image 用 contentFit='contain' → 不裁切、整張完整呈現。
// 點背景關閉 + 右上 × 關閉(加 safe-area 內距避免被 notch 蓋到)。
// ponytail: 沒做 pinch-to-zoom。MVP 需求是「讓使用者能看清楚」,1:1 已比 80×80 縮圖
// 大 10× 起跳(手機螢幕寬 400px,縮圖只有 80px),小字的話可以借 OS 的長按放大。
// 加 zoom = reanimated + gesture-handler worklets,~80 行,有需要再上。
export function PhotoViewer({ uri, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const open = uri !== null;

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <Image
          source={uri ? { uri } : undefined}
          style={styles.image}
          contentFit="contain"
          // 預先 cache:expo-image 自動處理,第二次開同一張立刻出圖。
          cachePolicy="memory-disk"
        />
        <Pressable
          onPress={() => { blurActive(); onClose(); }}
          accessibilityLabel="關閉照片"
          hitSlop={12}
          style={[styles.closeBtn, { top: insets.top + 12, right: 16 }]}
        >
          <Text style={styles.closeBtnText}>×</Text>
        </Pressable>
        {/* 透明背景點擊區:tap 空白處關閉。圖片本身不吃 Pressable
            (Image 預設不攔事件),所以整片 root 都會跳到這裡。 */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => { blurActive(); onClose(); }}
          accessibilityLabel="關閉照片"
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  image: { flex: 1, width: '100%' },
  closeBtn: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '600',
    lineHeight: 24,
  },
});
