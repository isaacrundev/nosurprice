import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type Props = {
  photos: string[];
  onAdd: () => void;
  onRemove: (idx: number) => void;
  // 點縮圖本身(不是 × 鈕)叫出全螢幕檢視;省略 = 不啟用。
  // 跟 onRemove 分開: × 釺是刪除(危險動作),點照片是查看(常見動作),不能撞。
  onPress?: (uri: string) => void;
  loading?: boolean;
  // 達上限時隱藏「＋」新增磚;省略 = 無上限。
  maxPhotos?: number;
};

// 80x80 縮圖網格 + 右下紅 × 刪除 + 虛線藍框 ＋ 新增
// loading=true 時「＋」變 spinner + disabled,讓使用者知道正在處理
export function PhotoGrid({ photos, onAdd, onRemove, onPress, loading, maxPhotos }: Props) {
  const atMax = maxPhotos != null && photos.length >= maxPhotos;

  return (
    <View style={styles.grid}>
      {photos.map((uri, idx) => (
        <View key={uri} style={styles.thumbWrap}>
          {onPress ? (
            <Pressable
              onPress={() => onPress(uri)}
              accessibilityLabel="檢視照片"
              accessibilityHint="點擊放大查看"
              style={({ pressed }) => [styles.thumbPressable, pressed && styles.thumbPressed]}
            >
              <Image source={{ uri }} style={styles.thumb} />
            </Pressable>
          ) : (
            <Image source={{ uri }} style={styles.thumb} />
          )}
          <Pressable
            onPress={() => onRemove(idx)}
            hitSlop={6}
            style={({ pressed }) => [
              styles.thumbX,
              pressed && styles.thumbXPressed,
            ]}
          >
            <Text style={styles.thumbXText}>×</Text>
          </Pressable>
        </View>
      ))}
      {!atMax && (
        <Pressable
          onPress={onAdd}
          disabled={loading}
          style={({ pressed }) => [
            styles.addTile,
            pressed && !loading && styles.addTilePressed,
            loading && styles.addTileLoading,
          ]}
        >
          {loading ? (
            <ActivityIndicator color="#208AEF" />
          ) : (
            <Text style={styles.addTileText}>＋</Text>
          )}
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumbWrap: { position: 'relative', width: 80, height: 80 },
  thumbPressable: { width: 80, height: 80, borderRadius: 6, overflow: 'hidden' },
  thumbPressed: { opacity: 0.6 },
  thumb: { width: 80, height: 80, borderRadius: 6, backgroundColor: '#eee' },
  thumbX: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#c00',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbXPressed: { opacity: 0.6 },
  thumbXText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 16,
  },
  addTile: {
    width: 80,
    height: 80,
    borderRadius: 6,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#208AEF',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0f8ff',
  },
  addTilePressed: { opacity: 0.6 },
  addTileLoading: { opacity: 0.5 },
  addTileText: { fontSize: 28, color: '#208AEF', fontWeight: '300' },
});
