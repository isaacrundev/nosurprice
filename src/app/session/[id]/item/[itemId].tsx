import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';

import { useStore } from '@/store';
import { parsePrice } from '@/types';
import { pickFromLibrary } from '@/utils/pickPhoto';
import { persistPhoto } from '@/utils/photoStorage';
import { confirmDestructive, showAlert } from '@/utils/dialog';
import { ocrRecognize } from '@/utils/ocr';
import { PhotoGrid } from '@/components/PhotoGrid';
import { PhotoViewer } from '@/components/PhotoViewer';

type FormValues = {
  name: string;
  price: string;
  quantity: string;
  note: string;
};

type Target = 'label' | 'extra';

export default function ItemDetailScreen() {
  const { id: sessionId, itemId } = useLocalSearchParams<{
    id: string;
    itemId: string;
  }>();
  const router = useRouter();
  const item = useStore((s) =>
    s.itemsBySession[sessionId]?.find((i) => i.id === itemId),
  );
  const updateItem = useStore((s) => s.updateItem);
  const deleteItem = useStore((s) => s.deleteItem);

  const { control, getValues, handleSubmit, reset, setValue } = useForm<FormValues>({
    defaultValues: {
      name: item?.name ?? '',
      price: item?.expectedPrice != null ? String(item.expectedPrice) : '',
      quantity: String(item?.quantity ?? 1),
      note: item?.note ?? '',
    },
  });

  const [labelPhotos, setLabelPhotos] = useState<string[]>(
    item?.labelPhotos ?? [],
  );
  const [extraPhotos, setExtraPhotos] = useState<string[]>(
    item?.extraPhotos ?? [],
  );
  // 正在挑 / 儲存中的 section;null 表示閒置。驅動 PhotoGrid 顯示 spinner
  const [pickingFor, setPickingFor] = useState<Target | null>(null);
  const [isOcring, setIsOcring] = useState(false);
  // 點縮圖 / header 大圖 → 全螢幕檢視
  const [viewerUri, setViewerUri] = useState<string | null>(null);

  // 同步 store 的 item 進來(進到不同 itemId 時觸發)
  useEffect(() => {
    if (!item) return;
    setLabelPhotos(item.labelPhotos);
    setExtraPhotos(item.extraPhotos);
    reset({
      name: item.name,
      price: item.expectedPrice != null ? String(item.expectedPrice) : '',
      quantity: String(item.quantity ?? 1),
      note: item.note ?? '',
    });
  }, [item?.id, reset]);

  const handleCapture = useCallback(async (target: Target) => {
    // 開 picker 不用 spinner;spinner 只覆蓋 persistPhoto 那段
    const rawUri = await pickFromLibrary();
    if (!rawUri) return;
    setPickingFor(target);
    try {
      const uri = Platform.OS === 'web' ? rawUri : await persistPhoto(rawUri);
      if (target === 'label') {
        setLabelPhotos((p) => [...p, uri]);
      } else {
        setExtraPhotos((p) => [...p, uri]);
      }
    } catch {
      showAlert('錯誤', '照片儲存失敗');
    } finally {
      setPickingFor(null);
    }
  }, []);

  const handleRemove = useCallback(async (target: Target, idx: number) => {
    const ok = await confirmDestructive('刪除照片', '確定刪除這張?');
    if (!ok) return;
    if (target === 'label') {
      setLabelPhotos((p) => p.filter((_, i) => i !== idx));
    } else {
      setExtraPhotos((p) => p.filter((_, i) => i !== idx));
    }
  }, []);

  const canSave = labelPhotos.length >= 1;

  const handleOcr = useCallback(async () => {
    if (labelPhotos.length === 0) {
      showAlert('需要標籤照', '請先拍或選一張標籤照才能辨識價格');
      return;
    }
    setIsOcring(true);
    try {
      // 自動抽取的價格不準時,把原文丟到備註,使用者對著原文挑正確價格
      const { price, texts } = await ocrRecognize(labelPhotos[0]);
      if (price !== null) {
        setValue('price', String(price));
      }
      if (texts.length > 0) {
        const block = `[OCR]\n${texts.join('\n')}`;
        const current = getValues('note').trim();
        setValue('note', current ? `${current}\n\n${block}` : block);
      }
      if (price !== null) {
        showAlert('辨識完成', `帶入價格 ${price} 元,完整辨識結果已放備註,請檢查`);
      } else if (texts.length > 0) {
        showAlert(
          'OCR 沒找到明顯價格',
          `抓到 ${texts.length} 行文字已放備註,請從中挑選正確價格`,
        );
      } else {
        showAlert('辨識失敗', '從這張圖找不到任何文字,請手動輸入');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '未知錯誤';
      showAlert('OCR 錯誤', msg);
    } finally {
      setIsOcring(false);
    }
  }, [labelPhotos, setValue, getValues]);

  const onSave = handleSubmit(async (data) => {
    // 名字空白也照存:使用者可能是先來補數量或價格,字串本身就空。
    const name = data.name.trim();
    const priceText = data.price.trim();
    let expectedPrice: number | undefined;
    if (priceText) {
      const parsed = parsePrice(priceText);
      if (parsed === null) {
        showAlert('價格格式不對', '請輸入正整數,例如 199 或 NT$199');
        return;
      }
      expectedPrice = parsed;
    }
    const qtyRaw = data.quantity.trim();
    const qtyParsed = qtyRaw === '' ? NaN : Number(qtyRaw);
    const quantity = Number.isFinite(qtyParsed) && qtyParsed >= 1 ? Math.round(qtyParsed) : 1;
    const note = data.note.trim() || undefined;

    await updateItem(itemId, {
      name,
      expectedPrice,
      quantity,
      labelPhotos,
      extraPhotos,
      note,
    });
    router.back();
  });

  const onDelete = useCallback(async () => {
    const ok = await confirmDestructive('刪除商品', '確定刪除這個商品?');
    if (!ok) return;
    await deleteItem(itemId);
    router.back();
  }, [deleteItem, itemId, router]);

  if (!item) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ title: '商品' }} />
        <View style={styles.missing}>
          <Text style={styles.missingText}>商品不存在</Text>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
          >
            <Text style={styles.backBtnText}>返回</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <PhotoViewer uri={viewerUri} onClose={() => setViewerUri(null)} />
      <Stack.Screen options={{ title: item.name }} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.kav}
      >
        <ScrollView contentContainerStyle={styles.content}>
          {item.labelPhotos[0] && (
            <Pressable
              onPress={() => setViewerUri(item.labelPhotos[0])}
              style={({ pressed }) => [pressed && styles.bigPhotoPressed]}
            >
              <Image
                source={{ uri: item.labelPhotos[0] }}
                style={styles.bigPhoto}
                resizeMode="cover"
              />
            </Pressable>
          )}

          <Field label="商品名稱 (選填)">
            <Controller
              control={control}
              name="name"
              render={({ field }) => (
                <TextInput
                  style={styles.input}
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  placeholder="例:御飯糰 鮭魚(留空也OK)"
                  placeholderTextColor="#a0a0a0"
                  returnKeyType="next"
                />
              )}
            />
          </Field>

          <Field label="數量">
            <Controller
              control={control}
              name="quantity"
              render={({ field }) => (
                <TextInput
                  style={[styles.input, styles.quantityInput]}
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  placeholder="1"
                  placeholderTextColor="#a0a0a0"
                  keyboardType="number-pad"
                />
              )}
            />
          </Field>

          <Field label="看到的價格 (NTD)">
            <Controller
              control={control}
              name="price"
              render={({ field }) => (
                <TextInput
                  style={styles.input}
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  placeholder="199"
                  placeholderTextColor="#a0a0a0"
                  keyboardType="number-pad"
                />
              )}
            />
            {labelPhotos.length > 0 && (
              <Pressable
                onPress={handleOcr}
                disabled={isOcring}
                style={({ pressed }) => [
                  styles.ocrBtn,
                  pressed && styles.ocrBtnPressed,
                  isOcring && styles.ocrBtnDisabled,
                ]}
              >
                {isOcring ? (
                  <View style={styles.ocrBtnRow}>
                    <ActivityIndicator size="small" />
                    <Text style={styles.ocrBtnText}>辨識中...</Text>
                  </View>
                ) : (
                  <Text style={styles.ocrBtnText}>📷 從標籤照辨識價格</Text>
                )}
              </Pressable>
            )}
          </Field>

          <Field label="備註 (選填)">
            <Controller
              control={control}
              name="note"
              render={({ field }) => (
                <TextInput
                  style={[styles.input, styles.multiline]}
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  placeholder="例:第二件 5 折 / 限今日"
                  placeholderTextColor="#a0a0a0"
                  multiline
                />
              )}
            />
          </Field>

          <View style={styles.photoSection}>
            <Text style={styles.photoLabel}>
              標籤照 <Text style={styles.required}>*</Text>
              <Text style={styles.photoHint}> 至少 1 張</Text>
            </Text>
            <PhotoGrid
              photos={labelPhotos}
              onAdd={() => handleCapture('label')}
              onRemove={(idx) => handleRemove('label', idx)}
              onPress={setViewerUri}
              loading={pickingFor === 'label'}
            />
          </View>

          <View style={styles.photoSection}>
            <Text style={styles.photoLabel}>其他照片 (選填)</Text>
            <PhotoGrid
              photos={extraPhotos}
              onAdd={() => handleCapture('extra')}
              onRemove={(idx) => handleRemove('extra', idx)}
              onPress={setViewerUri}
              loading={pickingFor === 'extra'}
            />
          </View>

          <Pressable
            onPress={onDelete}
            style={({ pressed }) => [
              styles.deleteBtn,
              pressed && styles.deleteBtnPressed,
            ]}
          >
            <Text style={styles.deleteBtnText}>刪除商品</Text>
          </Pressable>
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            onPress={onSave}
            disabled={!canSave}
            style={({ pressed }) => [
              styles.saveBtn,
              !canSave && styles.saveBtnDisabled,
              pressed && canSave && styles.saveBtnPressed,
            ]}
          >
            <Text style={styles.saveBtnText}>
              {canSave ? '儲存變更' : '需先拍標籤照'}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label}
        {required && <Text style={styles.required}> *</Text>}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  kav: { flex: 1 },
  content: { padding: 16, gap: 16 },
  bigPhoto: {
    width: '100%',
    height: 220,
    borderRadius: 8,
    backgroundColor: '#eee',
  },
  bigPhotoPressed: { opacity: 0.7 },
  field: { gap: 6 },
  label: { fontSize: 13, color: '#444', fontWeight: '500' },
  required: { color: '#c00' },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  quantityInput: { width: 100 },
  photoSection: { gap: 8, marginTop: 8 },
  photoLabel: { fontSize: 13, color: '#444', fontWeight: '500' },
  photoHint: { fontSize: 11, color: '#888', fontWeight: '400' },
  deleteBtn: {
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#c00',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  deleteBtnPressed: { backgroundColor: '#fdecec' },
  deleteBtnText: { color: '#c00', fontSize: 15, fontWeight: '600' },
  ocrBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#208AEF',
    backgroundColor: '#f0f7ff',
    marginTop: 4,
  },
  ocrBtnPressed: { opacity: 0.6 },
  ocrBtnDisabled: { opacity: 0.5 },
  ocrBtnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ocrBtnText: { color: '#208AEF', fontSize: 14, fontWeight: '600' },
  footer: {
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ccc',
    backgroundColor: '#fff',
  },
  saveBtn: {
    backgroundColor: '#208AEF',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnPressed: { opacity: 0.7 },
  saveBtnDisabled: { backgroundColor: '#aaa' },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  missing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 16,
  },
  missingText: { fontSize: 16, color: '#666' },
  backBtn: {
    backgroundColor: '#208AEF',
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  backBtnPressed: { opacity: 0.7 },
  backBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
