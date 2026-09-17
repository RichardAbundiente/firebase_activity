import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Feather } from '@expo/vector-icons';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { db, isFirebaseConfigured, storage } from './firebase';

const emptyForm = { name: '', course: '', yearLevel: '', email: '', age: '' };

export default function App() {
  const [students, setStudents] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [photo, setPhoto] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [reading, setReading] = useState(true);
  const [message, setMessage] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState('');
  const [program, setProgram] = useState(null);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setReading(false);
      return undefined;
    }

    const studentsQuery = query(collection(db, 'students'), orderBy('createdAt', 'desc'));
    return onSnapshot(
      studentsQuery,
      (snapshot) => {
        setStudents(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
        setReading(false);
      },
      () => {
        setMessage({ type: 'error', text: 'Could not retrieve student records.' });
        setReading(false);
      },
    );
  }, []);

  const updateField = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const choosePhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setMessage({ type: 'error', text: 'Photo access is needed to choose a profile picture.' });
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.75,
    });
    if (!result.canceled) setPhoto(result.assets[0].uri);
  };

  const validate = () => {
    const requiredFields = [form.name, form.course, form.yearLevel, form.email, form.age];
    if (requiredFields.some((value) => !value.trim())) {
      setMessage({ type: 'error', text: 'Please complete every field before saving.' });
      return false;
    }
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) {
      setMessage({ type: 'error', text: 'Please enter a valid email address.' });
      return false;
    }
    if (Number.isNaN(Number(form.age)) || Number(form.age) < 1) {
      setMessage({ type: 'error', text: 'Age must be a positive number.' });
      return false;
    }
    return true;
  };

  // Try Cloud Storage first (the supported path once a bucket exists); if the
  // project has no provisioned bucket (404 on Spark plan), store the photo as a
  // compact data URI directly in the Firestore document instead.
  const uploadPhoto = async (uri, studentId) => {
    const response = await fetch(uri);
    const blob = await response.blob();
    if (blob.size > 900_000) {
      throw new Error('Photo is too large after compression. Please choose a smaller image.');
    }
    try {
      const imageRef = ref(storage, `student-profiles/${studentId}-${Date.now()}.jpg`);
      await uploadBytes(imageRef, blob, { contentType: 'image/jpeg' });
      return getDownloadURL(imageRef);
    } catch (error) {
      const code = error?.code || '';
      if (code !== 'storage/unauthorized' && code !== 'storage/unknown' && !/not found|not exist/i.test(error?.message || '')) {
        throw error;
      }
      const dataUri = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Could not read the chosen photo.'));
        reader.readAsDataURL(blob);
      });
      if (dataUri.length > 1_400_000) {
        throw new Error('Photo is too large to store inline. Please choose a smaller image.');
      }
      return dataUri;
    }
  };

  // Local image URIs: file:// (native) and blob:/content: (web/native).
  // Remote URLs and data: URIs are already persisted and must not re-upload.
  const isLocalImage = (uri) => !!uri && /^(file:|blob:|content:)/.test(uri);

  const saveStudent = async () => {
    if (!isFirebaseConfigured) {
      setMessage({ type: 'error', text: 'Add your Firebase values to .env before saving.' });
      return;
    }
    if (!validate()) return;

    setLoading(true);
    setMessage(null);
    try {
      const data = {
        ...form,
        name: form.name.trim(),
        course: form.course.trim(),
        yearLevel: form.yearLevel.trim(),
        email: form.email.trim(),
        age: Number(form.age),
        updatedAt: serverTimestamp(),
      };
      if (editingId) {
        if (isLocalImage(photo)) data.profileImageUrl = await uploadPhoto(photo, editingId);
        await updateDoc(doc(db, 'students', editingId), data);
        setMessage({ type: 'success', text: 'Student record updated.' });
      } else {
        const created = await addDoc(collection(db, 'students'), { ...data, createdAt: serverTimestamp() });
        if (isLocalImage(photo)) await updateDoc(doc(db, 'students', created.id), { profileImageUrl: await uploadPhoto(photo, created.id) });
        setMessage({ type: 'success', text: 'Student record saved.' });
      }
      resetForm();
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'Could not save the record.' });
    } finally {
      setLoading(false);
    }
  };

  const editStudent = (student) => {
    setEditingId(student.id);
    setForm({ name: student.name || '', course: student.course || '', yearLevel: student.yearLevel || '', email: student.email || '', age: String(student.age || '') });
    setPhoto(student.profileImageUrl || null);
    setMessage(null);
  };

  // Ask for confirmation with an in-app overlay: Alert.alert is not
  // implemented on react-native-web, so the old flow silently did nothing.
  const removeStudent = (student) => {
    setMessage(null);
    setPendingDelete(student);
  };

  const confirmDelete = async () => {
    const student = pendingDelete;
    if (!student || deleting) return;
    setDeleting(true);
    try {
      // Best effort: also remove the profile photo from Cloud Storage
      // (inline data-URI photos live in the doc itself and need no cleanup).
      if (student.profileImageUrl && !student.profileImageUrl.startsWith('data:')) {
        try {
          const objectPath = decodeURIComponent(
            new URL(student.profileImageUrl).pathname.split('/o/')[1] || '',
          ).split('?')[0];
          if (objectPath) await deleteObject(ref(storage, objectPath));
        } catch {
          // Missing bucket/file shouldn't block the record deletion.
        }
      }
      await deleteDoc(doc(db, 'students', student.id));
      if (editingId === student.id) resetForm();
      setMessage({ type: 'success', text: `Deleted ${student.name || 'student record'}.` });
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'Could not delete the record.' });
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  };

  const resetForm = () => { setForm(emptyForm); setPhoto(null); setEditingId(null); };

  const programs = useMemo(
    () => Array.from(new Set(students.map((s) => s.course).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [students],
  );

  const filteredStudents = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return students.filter((s) => {
      if (program && (s.course || '') !== program) return false;
      if (!needle) return true;
      return [s.name, s.course, s.email].some((value) => (value || '').toLowerCase().includes(needle));
    });
  }, [students, search, program]);

  const renderStudent = ({ item }) => (
    <View style={styles.studentRow}>
      {item.profileImageUrl ? <Image source={{ uri: item.profileImageUrl }} style={styles.avatar} /> : <View style={[styles.avatarFallback, { backgroundColor: accentsFor(item.name).bg }]}><Text style={styles.avatarText}>{item.name?.charAt(0)?.toUpperCase() || '?'}</Text></View>}
      <View style={styles.studentInfo}>
        <Text style={styles.studentName}>{item.name}</Text>
        <Text style={styles.studentMeta}>{item.course} · Year {item.yearLevel} · Age {item.age}</Text>
        <Text style={styles.studentEmail}>{item.email}</Text>
      </View>
      <View style={styles.rowActions}>
        <Pressable onPress={() => editStudent(item)} style={styles.iconButton} accessibilityLabel={`Edit ${item.name}`}><Feather name="edit-2" size={16} color="#32d6ae" /></Pressable>
        <Pressable onPress={() => removeStudent(item)} style={styles.iconButton} accessibilityLabel={`Delete ${item.name}`}><Feather name="trash-2" size={16} color="#ff76a8" /></Pressable>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>FIREBASE / DIRECTORY</Text>
              <Text style={styles.title}>Student records</Text>
            </View>
            <View style={styles.headerMark}><Feather name="users" size={22} color="#0a0f14" /></View>
          </View>
          <Text style={styles.subtitle}>A small, live directory for your campus community.</Text>

          {!isFirebaseConfigured && (
            <View style={styles.setupNotice}>
              <Feather name="info" size={18} color="#f7b858" />
              <Text style={styles.setupText}>Firebase is not configured. Copy .env.example to .env and add your project values.</Text>
            </View>
          )}
          {message && <View style={[styles.message, message.type === 'error' ? styles.errorMessage : styles.successMessage]}><Text style={styles.messageText}>{message.text}</Text></View>}

          <View style={styles.formCard}>
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>{editingId ? 'Edit student' : 'Add a student'}</Text>
              {editingId && <Pressable onPress={resetForm}><Text style={styles.cancelText}>Cancel</Text></Pressable>}
            </View>
            <Pressable style={styles.photoPicker} onPress={choosePhoto}>
              {photo ? <Image source={{ uri: photo }} style={styles.photoPreview} /> : <View style={styles.photoPlaceholder}><Feather name="camera" size={22} color="#32d6ae" /></View>}
              <View>
                <Text style={styles.photoTitle}>{photo ? 'Change profile picture' : 'Add profile picture'}</Text>
                <Text style={styles.photoHint}>Optional · stored in Cloud Storage</Text>
              </View>
            </Pressable>
            <View style={styles.field}>
              <Text style={styles.label}>FULL NAME</Text>
              <TextInput value={form.name} onChangeText={(value) => updateField('name', value)} placeholder="e.g. Jordan Lee" placeholderTextColor="#7d8ea0" style={styles.input} />
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>COURSE / PROGRAM</Text>
              <TextInput value={form.course} onChangeText={(value) => updateField('course', value)} placeholder="e.g. Computer Science" placeholderTextColor="#7d8ea0" style={styles.input} />
            </View>
            <View style={styles.splitFields}>
              <View style={styles.halfField}>
                <Text style={styles.label}>YEAR LEVEL</Text>
                <TextInput value={form.yearLevel} onChangeText={(value) => updateField('yearLevel', value)} placeholder="e.g. 2" placeholderTextColor="#7d8ea0" keyboardType="number-pad" style={styles.input} />
              </View>
              <View style={styles.halfField}>
                <Text style={styles.label}>AGE</Text>
                <TextInput value={form.age} onChangeText={(value) => updateField('age', value)} placeholder="e.g. 20" placeholderTextColor="#7d8ea0" keyboardType="number-pad" style={styles.input} />
              </View>
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>EMAIL</Text>
              <TextInput value={form.email} onChangeText={(value) => updateField('email', value)} placeholder="student@example.com" placeholderTextColor="#7d8ea0" keyboardType="email-address" autoCapitalize="none" style={styles.input} />
            </View>
            <Pressable style={({ pressed }) => [styles.saveButton, pressed && styles.pressed, loading && styles.disabled]} onPress={saveStudent} disabled={loading}>
              {loading ? <ActivityIndicator color="#0a0f14" /> : <><Feather name={editingId ? 'check' : 'plus'} size={18} color="#0a0f14" /><Text style={styles.saveButtonText}>{editingId ? 'Update record' : 'Save record'}</Text></>}
            </Pressable>
          </View>

          <View style={styles.listHeader}>
            <Text style={styles.sectionTitle}>Directory</Text>
            <Text style={styles.count}>
              {search.trim() || program
                ? `${filteredStudents.length} match${filteredStudents.length === 1 ? '' : 'es'}`
                : `${students.length} ${students.length === 1 ? 'student' : 'students'}`}
            </Text>
          </View>
          {reading ? (
            <ActivityIndicator color="#32d6ae" style={styles.loader} />
          ) : (
            <>
              <View style={styles.searchBox}>
                <Feather name="search" size={16} color="#7d8ea0" />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search name, course, or email…"
                  placeholderTextColor="#7d8ea0"
                  style={styles.searchInput}
                  accessibilityLabel="Search students"
                />
                {search.length > 0 && (
                  <Pressable onPress={() => setSearch('')} accessibilityLabel="Clear search" hitSlop={8}>
                    <Feather name="x-circle" size={16} color="#7d8ea0" />
                  </Pressable>
                )}
              </View>
              {programs.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  <Pressable style={[styles.chip, !program && styles.chipActive]} onPress={() => setProgram(null)}>
                    <Text style={[styles.chipText, !program && styles.chipTextActive]}>All programs</Text>
                  </Pressable>
                  {programs.map((p) => (
                    <Pressable key={p} style={[styles.chip, program === p && styles.chipActive]} onPress={() => setProgram(program === p ? null : p)}>
                      <Text style={[styles.chipText, program === p && styles.chipTextActive]}>{p}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              )}
              <FlatList
                data={filteredStudents}
                keyExtractor={(item) => item.id}
                renderItem={renderStudent}
                scrollEnabled={false}
                ListEmptyComponent={
                  <Text style={styles.empty}>
                    {students.length === 0 ? 'No records yet. Add the first student above.' : 'No students match your search or filter.'}
                  </Text>
                }
              />
            </>
          )}
        </ScrollView>

        {pendingDelete && (
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <View style={styles.modalIcon}><Feather name="alert-triangle" size={22} color="#ff76a8" /></View>
              <Text style={styles.modalTitle}>Delete record?</Text>
              <Text style={styles.modalBody}>
                Remove {pendingDelete.name || 'this student'} from the directory? This cannot be undone.
              </Text>
              <View style={styles.modalActions}>
                <Pressable style={({ pressed }) => [styles.modalButton, styles.modalCancel, pressed && styles.pressed]} onPress={() => setPendingDelete(null)}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </Pressable>
                <Pressable style={({ pressed }) => [styles.modalButton, styles.modalDelete, pressed && styles.pressed, deleting && styles.disabled]} onPress={confirmDelete} disabled={deleting}>
                  {deleting ? <ActivityIndicator color="#0a0f14" /> : <Text style={styles.modalDeleteText}>Delete</Text>}
                </Pressable>
              </View>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const avatarPalette = [
  { bg: 'rgba(50, 214, 174, 0.16)', fg: '#32d6ae' },
  { bg: 'rgba(247, 184, 88, 0.16)', fg: '#f7b858' },
  { bg: 'rgba(255, 118, 168, 0.16)', fg: '#ff76a8' },
  { bg: 'rgba(86, 196, 255, 0.16)', fg: '#56c4ff' },
];

const accentsFor = (name) => {
  let sum = 0;
  for (const char of name || '') sum += char.charCodeAt(0);
  return avatarPalette[sum % avatarPalette.length];
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#0a0f14' },
  screen: { flex: 1 },
  content: { padding: 24, paddingBottom: 48 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  eyebrow: { color: '#8ba0b1', fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },
  title: { color: '#f3f5f7', fontSize: 31, fontWeight: '800', marginTop: 5 },
  subtitle: { color: '#a4b4c2', fontSize: 15, marginTop: 8, marginBottom: 22 },
  headerMark: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#32d6ae', alignItems: 'center', justifyContent: 'center' },
  setupNotice: { flexDirection: 'row', backgroundColor: 'rgba(247, 184, 88, 0.12)', borderWidth: 1, borderColor: 'rgba(247, 184, 88, 0.35)', padding: 12, borderRadius: 10, gap: 9, marginBottom: 14 },
  setupText: { color: '#f7b858', flex: 1, fontSize: 13, lineHeight: 18 },
  message: { padding: 12, borderRadius: 10, marginBottom: 14 },
  errorMessage: { backgroundColor: 'rgba(255, 118, 168, 0.12)', borderWidth: 1, borderColor: 'rgba(255, 118, 168, 0.35)' },
  successMessage: { backgroundColor: 'rgba(50, 214, 174, 0.12)', borderWidth: 1, borderColor: 'rgba(50, 214, 174, 0.35)' },
  messageText: { color: '#edf1f4', fontSize: 13 },
  formCard: { backgroundColor: '#1c232d', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: '#2e3945' },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionTitle: { color: '#f3f5f7', fontSize: 19, fontWeight: '800' },
  cancelText: { color: '#ff76a8', fontWeight: '700', fontSize: 13 },
  photoPicker: { flexDirection: 'row', alignItems: 'center', marginBottom: 18, gap: 12 },
  photoPlaceholder: { width: 54, height: 54, borderRadius: 27, backgroundColor: 'rgba(50, 214, 174, 0.14)', borderWidth: 1, borderColor: 'rgba(50, 214, 174, 0.4)', alignItems: 'center', justifyContent: 'center' },
  photoPreview: { width: 54, height: 54, borderRadius: 27 },
  photoTitle: { color: '#32d6ae', fontSize: 14, fontWeight: '700' },
  photoHint: { color: '#7d8ea0', fontSize: 12, marginTop: 3 },
  field: { marginBottom: 14 },
  splitFields: { flexDirection: 'row', gap: 12 },
  halfField: { flex: 1 },
  label: { color: '#8ba0b1', fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 7 },
  input: { backgroundColor: '#12181f', borderWidth: 1, borderColor: '#2e3945', borderRadius: 9, height: 47, paddingHorizontal: 13, color: '#edf1f4', fontSize: 15 },
  saveButton: { backgroundColor: '#32d6ae', height: 49, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, marginTop: 3 },
  saveButtonText: { color: '#0a0f14', fontWeight: '800', fontSize: 15 },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.6 },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 28, marginBottom: 12 },
  count: { color: '#8ba0b1', fontSize: 13 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: '#12181f', borderWidth: 1, borderColor: '#2e3945', borderRadius: 10, height: 45, paddingHorizontal: 13 },
  searchInput: { flex: 1, color: '#edf1f4', fontSize: 14, paddingVertical: 0 },
  chipRow: { gap: 8, paddingVertical: 12, paddingHorizontal: 1 },
  chip: { backgroundColor: '#1c232d', borderWidth: 1, borderColor: '#2e3945', borderRadius: 999, paddingHorizontal: 13, paddingVertical: 7 },
  chipActive: { backgroundColor: 'rgba(50, 214, 174, 0.14)', borderColor: '#32d6ae' },
  chipText: { color: '#a4b4c2', fontSize: 12, fontWeight: '700' },
  chipTextActive: { color: '#32d6ae' },
  loader: { marginTop: 24 },
  empty: { color: '#8ba0b1', textAlign: 'center', padding: 24, fontSize: 14 },
  studentRow: { backgroundColor: '#1c232d', borderWidth: 1, borderColor: '#2e3945', borderRadius: 13, padding: 12, flexDirection: 'row', alignItems: 'center', marginBottom: 9 },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarFallback: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 19, fontWeight: '800', color: '#edf1f4' },
  studentInfo: { flex: 1, marginLeft: 12 },
  studentName: { color: '#f3f5f7', fontSize: 15, fontWeight: '800' },
  studentMeta: { color: '#a4b4c2', fontSize: 12, marginTop: 3 },
  studentEmail: { color: '#7d8ea0', fontSize: 11, marginTop: 3 },
  rowActions: { flexDirection: 'row', gap: 3, marginLeft: 5 },
  iconButton: { padding: 8 },
  modalBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(4, 8, 12, 0.72)', alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 50 },
  modalCard: { width: '100%', maxWidth: 360, backgroundColor: '#1c232d', borderWidth: 1, borderColor: '#2e3945', borderRadius: 16, padding: 20 },
  modalIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255, 118, 168, 0.14)', borderWidth: 1, borderColor: 'rgba(255, 118, 168, 0.4)', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  modalTitle: { color: '#f3f5f7', fontSize: 18, fontWeight: '800', marginBottom: 6 },
  modalBody: { color: '#a4b4c2', fontSize: 14, lineHeight: 20, marginBottom: 18 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  modalButton: { borderRadius: 10, paddingHorizontal: 16, height: 42, alignItems: 'center', justifyContent: 'center', minWidth: 96 },
  modalCancel: { backgroundColor: '#12181f', borderWidth: 1, borderColor: '#2e3945' },
  modalCancelText: { color: '#a4b4c2', fontWeight: '700', fontSize: 14 },
  modalDelete: { backgroundColor: '#ff76a8' },
  modalDeleteText: { color: '#0a0f14', fontWeight: '800', fontSize: 14 },
});
