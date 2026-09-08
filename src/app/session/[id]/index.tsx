import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { useMemo } from 'react';
import { useStore } from '@/store';
import { confirmDestructive } from '@/utils/dialog';
import { formatPrice, lineTotal } from '@/types';
import type { Item } from '@/types';

// ponytail: zustand selector 不能回傳新建的 [] (Object.is 會誤判變動、無限 re-render)。
// 用 module 常數維持 stable reference;key 存在時一樣回原 array,addItem/deleteItem
// 走 set() 換新 array reference → re-render 正常。
const EMPTY_ITEMS: Item[] = [];

export default function ItemList() {
  const { id: sessionId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const session = useStore((s) => s.sessions.find((x) => x.id === sessionId));
  const items = useStore((s) => s.itemsBySession[sessionId] ?? EMPTY_ITEMS);
  const updateSession = useStore((s) => s.updateSession);

  // 空 session 自動清掉:用 ref 記最新 items,unmount(back/離開)時檢查
  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(() => {
    return () => {
      if (itemsRef.current.length === 0) {
        void useStore.getState().deleteSession(sessionId);
      }
    };
  }, [sessionId]);

  const handleNewItem = useCallback(() => {
    router.push(`/session/${sessionId}/item/new`);
  }, [router, sessionId]);

  const handleItemTap = useCallback((item: Item) => {
    router.push(`/session/${sessionId}/item/${item.id}`);
  }, [router, sessionId]);

  // 採買選單(編輯 / 刪除)
  const [menuOpen, setMenuOpen] = useState(false);
  const openMenu = useCallback(() => setMenuOpen(true), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  // 編輯 modal
  const [editOpen, setEditOpen] = useState(false);
  const [editStoreName, setEditStoreName] = useState('');
  const [editNote, setEditNote] = useState('');

  const openEdit = useCallback(() => {
    setEditStoreName(session?.storeName ?? '');
    setEditNote(session?.note ?? '');
    setMenuOpen(false);
    setEditOpen(true);
  }, [session?.storeName, session?.note]);

  const saveEdit = useCallback(async () => {
    await updateSession(sessionId, {
      storeName: editStoreName.trim() || undefined,
      note: editNote.trim() || undefined,
    });
    setEditOpen(false);
  }, [editStoreName, editNote, sessionId, updateSession]);

  const handleDeleteSession = useCallback(async () => {
    setMenuOpen(false);
    const ok = await confirmDestructive(
      '刪除採買',
      '這筆採買紀錄會整個刪除,連同所有商品照片',
    );
    if (!ok) return;
    await useStore.getState().deleteSession(sessionId);
    router.back();
  }, [router, sessionId]);

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen
        options={{
          title: session?.storeName?.trim() || '採買清單',
          headerRight: () => (
            <View style={styles.headerRight}>
              <Pressable onPress={openMenu} hitSlop={12} style={styles.menuBtn}>
                <Text style={styles.menuBtnText}>⋯</Text>
              </Pressable>
              <Pressable onPress={handleNewItem} hitSlop={12} style={styles.headerRightBtn}>
                <Text style={styles.headerPlus}>＋ 新增商品</Text>
              </Pressable>
            </View>
          ),
        }}
      />
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        // 底部 padding 留給 TotalBar(~64),不然最後一筆會被 bar 蓋住
        contentContainerStyle={
          items.length === 0
            ? styles.emptyContainer
            : styles.listContent
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>尚無商品</Text>
            <Text style={styles.emptyHint}>點上方「＋ 新增商品」開始</Text>
          </View>
        }
        renderItem={({ item }) => (
          <ItemRow item={item} onPress={handleItemTap} />
        )}
      />

      {/* 採買總計:釘底 bar,結帳時一眼就能看到「目前跑多少」。
          用 useMemo 確保 items 沒變就不重算(items reference 變才重算)。 */}
      <TotalBar items={items} />

      {/* 採買選單 */}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={closeMenu}>
        <Pressable style={styles.backdrop} onPress={closeMenu}>
          <View style={styles.menuSheet}>
            <Pressable
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
              onPress={openEdit}
            >
              <Text style={styles.menuItemText}>編輯採買</Text>
            </Pressable>
            <View style={styles.menuDivider} />
            <Pressable
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
              onPress={handleDeleteSession}
            >
              <Text style={[styles.menuItemText, styles.menuItemDanger]}>刪除採買</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* 編輯採買 */}
      <Modal visible={editOpen} transparent animationType="fade" onRequestClose={() => setEditOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.editCard}>
            <Text style={styles.editTitle}>編輯採買</Text>
            <Text style={styles.editLabel}>店家名稱 (選填)</Text>
            <TextInput
              style={styles.editInput}
              value={editStoreName}
              onChangeText={setEditStoreName}
              placeholder="例如 全聯 / 家樂福"
              placeholderTextColor="#999"
            />
            <Text style={styles.editLabel}>備註 (選填)</Text>
            <TextInput
              style={[styles.editInput, styles.editInputMulti]}
              value={editNote}
              onChangeText={setEditNote}
              placeholder="這次採買的整體備註"
              placeholderTextColor="#999"
              multiline
            />
            <View style={styles.editActions}>
              <Pressable
                onPress={() => setEditOpen(false)}
                style={({ pressed }) => [
                  styles.editBtn,
                  styles.editBtnGhost,
                  pressed && styles.editBtnPressed,
                ]}
              >
                <Text style={styles.editBtnGhostText}>取消</Text>
              </Pressable>
              <Pressable
                onPress={saveEdit}
                style={({ pressed }) => [
                  styles.editBtn,
                  styles.editBtnPrimary,
                  pressed && styles.editBtnPressed,
                ]}
              >
                <Text style={styles.editBtnPrimaryText}>儲存</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function ItemRow({ item, onPress }: { item: Item; onPress: (item: Item) => void }) {
  const thumbUri = item.labelPhotos[0];
  // 購物現場要的是「一眼算的出來」 — 把 qty × unit 與小計並排,沒單價就只剩數量,
  // 完全沒數量的舊資料也不會爆炸。
  const qty = Math.max(1, Math.round(item.quantity || 1));
  const subtotal = lineTotal(item);
  const unit = formatPrice(item.expectedPrice);
  return (
    <Pressable
      onPress={() => onPress(item)}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.rowInner}>
        {thumbUri ? (
          <Image source={{ uri: thumbUri }} style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, styles.thumbPlaceholder]} />
        )}
        <View style={styles.rowMain}>
          <View style={styles.rowTextCol}>
            <Text style={styles.rowName} numberOfLines={1}>
              {item.name.trim() || '未命名商品'}
            </Text>
            <Text style={styles.rowCalc} numberOfLines={1}>
              {qty} × {unit || '未填單價'}
            </Text>
          </View>
          <Text style={styles.rowTotal}>{formatPrice(subtotal) || '—'}</Text>
        </View>
      </View>
      {item.note?.trim() && (
        <Text style={styles.rowNote} numberOfLines={1}>
          {item.note}
        </Text>
      )}
    </Pressable>
  );
}

// ponytail: 結帳前的「總計」應該永遠看得到 — 釘底 bar,即使空清單也提醒「0 元」確認沒漏。
function TotalBar({ items }: { items: Item[] }) {
  // 只在 items reference 變時重算;useMemo 防每 render 都跑 sum
  const { count, sum } = useMemo(() => {
    let sum = 0;
    let count = 0;
    for (const it of items) {
      const t = lineTotal(it);
      if (t != null) sum += t;
      // 件數算「買的單位數」:qty 為主,沒 qty 算 1 件
      count += Math.max(1, Math.round(it.quantity || 1));
    }
    return { count, sum };
  }, [items]);

  return (
    <View style={styles.totalBar}>
      <Text style={styles.totalBarLabel}>{`採買總計 ${count} 件`}</Text>
      <Text style={styles.totalBarAmount}>{formatPrice(sum)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 8 },
  menuBtn: { paddingHorizontal: 4, paddingVertical: 4 },
  menuBtnText: { fontSize: 22, color: '#208AEF', fontWeight: '700', lineHeight: 22 },
  headerRightBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  headerPlus: {
    color: '#208AEF',
    fontSize: 16,
    fontWeight: '600',
  },
  row: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ccc',
  },
  rowPressed: { backgroundColor: '#f0f0f0' },
  rowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: 6,
    backgroundColor: '#eee',
  },
  thumbPlaceholder: { backgroundColor: '#f0f0f0' },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  rowTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowName: {
    fontSize: 16,
    fontWeight: '600',
  },
  rowCalc: {
    fontSize: 13,
    color: '#666',
  },
  rowTotal: {
    fontSize: 17,
    color: '#208AEF',
    fontWeight: '700',
  },
  rowNote: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },

  // 釘底總計 bar
  totalBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ccc',
  },
  totalBarLabel: {
    fontSize: 14,
    color: '#444',
    fontWeight: '500',
  },
  totalBarAmount: {
    fontSize: 22,
    fontWeight: '800',
    color: '#208AEF',
  },
  emptyContainer: { flexGrow: 1, paddingBottom: 64 },
  listContent: { paddingBottom: 88 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 8,
  },
  emptyTitle: { fontSize: 16, color: '#444' },
  emptyHint: { fontSize: 13, color: '#888' },

  // 採買選單 sheet
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  menuSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  menuItem: { paddingVertical: 14 },
  menuItemPressed: { opacity: 0.5 },
  menuItemText: { fontSize: 16, color: '#208AEF', textAlign: 'center' },
  menuItemDanger: { color: '#c00', fontWeight: '600' },
  menuDivider: { height: StyleSheet.hairlineWidth, backgroundColor: '#ddd' },

  // 編輯 modal
  editCard: {
    backgroundColor: '#fff',
    margin: 24,
    marginTop: 'auto',
    marginBottom: 'auto',
    borderRadius: 14,
    padding: 20,
    gap: 8,
  },
  editTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  editLabel: { fontSize: 13, color: '#666', marginTop: 4 },
  editInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
  },
  editInputMulti: { minHeight: 70, textAlignVertical: 'top' },
  editActions: { flexDirection: 'row', gap: 12, marginTop: 12 },
  editBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  editBtnPressed: { opacity: 0.7 },
  editBtnGhost: { backgroundColor: '#f0f0f0' },
  editBtnGhostText: { color: '#444', fontSize: 15, fontWeight: '600' },
  editBtnPrimary: { backgroundColor: '#208AEF' },
  editBtnPrimaryText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
