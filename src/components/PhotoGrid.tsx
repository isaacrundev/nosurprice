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
  loading?: boolean;
};

// 80x80 縮圖網格 + 右下紅 × 刪除 + 虛線藍框 ＋ 新增
// loading=true 時「＋」變 spinner + disabled,讓使用者知道正在處理
export function PhotoGrid({ photos, onAdd, onRemove, loading }: Props) {
  return (
    <View style={styles.grid}>
      {photos.map((uri, idx) => (
        <View key={uri} style={styles.thumbWrap}>
          <Image source={{ uri }} style={styles.thumb} />
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
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumbWrap: { position: 'relative', width: 80, height: 80 },
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
