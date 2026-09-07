import { useCallback, useEffect } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';

import { useStore } from '@/store';
import type { Session } from '@/types';

function formatDateTime(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${m}/${day} ${h}:${min}`;
}

export default function Home() {
  const router = useRouter();
  const sessions = useStore((s) => s.sessions);
  const itemsBySession = useStore((s) => s.itemsBySession);
  const isReady = useStore((s) => s.isReady);
  const hydrate = useStore((s) => s.hydrate);
  const createSession = useStore((s) => s.createSession);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const handleNew = useCallback(async () => {
    const sess = await createSession();
    router.push(`/session/${sess.id}`);
  }, [createSession, router]);

  if (!isReady) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen
        options={{
          title: '採買紀錄',
          headerRight: () => (
            <Pressable onPress={handleNew} hitSlop={12} style={styles.headerRightBtn}>
              <Text style={styles.plus}>＋ 新增採買</Text>
            </Pressable>
          ),
        }}
      />
      <FlatList
        data={sessions}
        keyExtractor={(s) => s.id}
        contentContainerStyle={
          sessions.length === 0 ? styles.emptyContainer : undefined
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>還沒有任何採買紀錄</Text>
            <Text style={styles.emptyHint}>
              點上方「＋ 新增採買」開始第一次
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <SessionRow
            session={item}
            itemCount={itemsBySession[item.id]?.length ?? 0}
            onPress={() => router.push(`/session/${item.id}`)}
          />
        )}
      />
    </SafeAreaView>
  );
}

function SessionRow({
  session,
  itemCount,
  onPress,
}: {
  session: Session;
  itemCount: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <Text style={styles.rowTitle}>
        {session.storeName?.trim() || '未命名採買'}
      </Text>
      <Text style={styles.rowMeta}>
        {formatDateTime(session.createdAt)} · {itemCount} 件
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plus: {
    color: '#208AEF',
    fontSize: 16,
    fontWeight: '600',
  },
  headerRightBtn: { paddingHorizontal: 12, paddingVertical: 4 },
  row: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ccc',
  },
  rowPressed: { backgroundColor: '#f0f0f0' },
  rowTitle: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  rowMeta: { fontSize: 13, color: '#666' },
  emptyContainer: { flexGrow: 1 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 8,
  },
  emptyTitle: { fontSize: 16, color: '#444' },
  emptyHint: { fontSize: 13, color: '#888' },
});
