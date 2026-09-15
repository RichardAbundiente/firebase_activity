import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
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

  const uploadPhoto = async (uri, studentId) => {
    const response = await fetch(uri);
    const blob = await response.blob();
    const imageRef = ref(storage, `student-profiles/${studentId}-${Date.now()}.jpg`);
    await uploadBytes(imageRef, blob, { contentType: 'image/jpeg' });
    return getDownloadURL(imageRef);
  };

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
        if (photo && photo.startsWith('file://')) data.profileImageUrl = await uploadPhoto(photo, editingId);
        await updateDoc(doc(db, 'students', editingId), data);
        setMessage({ type: 'success', text: 'Student record updated.' });
      } else {
        const created = await addDoc(collection(db, 'students'), { ...data, createdAt: serverTimestamp() });
        if (photo) await updateDoc(doc(db, 'students', created.id), { profileImageUrl: await uploadPhoto(photo, created.id) });
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

  const removeStudent = (student) => {
    Alert.alert('Delete record?', `Remove ${student.name} from the directory?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await deleteDoc(doc(db, 'students', student.id));
          setMessage({ type: 'success', text: 'Student record deleted.' });
        } catch (error) {
          setMessage({ type: 'error', text: error.message || 'Could not delete the record.' });
        }
      } },
    ]);
  };

  const resetForm = () => { setForm(emptyForm); setPhoto(null); setEditingId(null); };

  const renderStudent = ({ item }) => (
    <View style={styles.studentRow}>
      {item.profileImageUrl ? <Image source={{ uri: item.profileImageUrl }} style={styles.avatar} /> : <View style={styles.avatarFallback}><Text style={styles.avatarText}>{item.name?.charAt(0)?.toUpperCase() || '?'}</Text></View>}
      <View style={styles.studentInfo}>
        <Text style={styles.studentName}>{item.name}</Text>
        <Text style={styles.studentMeta}>{item.course} · Year {item.yearLevel} · Age {item.age}</Text>
        <Text style={styles.studentEmail}>{item.email}</Text>
      </View>
      <View style={styles.rowActions}>
        <Pressable onPress={() => editStudent(item)} style={styles.iconButton} accessibilityLabel={`Edit ${item.name}`}><Feather name="edit-2" size={17} color="#315c55" /></Pressable>
        <Pressable onPress={() => removeStudent(item)} style={styles.iconButton} accessibilityLabel={`Delete ${item.name}`}><Feather name="trash-2" size={17} color="#b34e45" /></Pressable>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}><View><Text style={styles.eyebrow}>FIREBASE / DIRECTORY</Text><Text style={styles.title}>Student records</Text></View><View style={styles.headerMark}><Feather name="users" size={22} color="#f7f8f4" /></View></View>
          <Text style={styles.subtitle}>A small, live directory for your campus community.</Text>

          {!isFirebaseConfigured && <View style={styles.setupNotice}><Feather name="info" size={18} color="#8a611e" /><Text style={styles.setupText}>Firebase is not configured. Copy .env.example to .env and add your project values.</Text></View>}
          {message && <View style={[styles.message, message.type === 'error' ? styles.errorMessage : styles.successMessage]}><Text style={styles.messageText}>{message.text}</Text></View>}

          <View style={styles.formCard}>
            <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>{editingId ? 'Edit student' : 'Add a student'}</Text>{editingId && <Pressable onPress={resetForm}><Text style={styles.cancelText}>Cancel</Text></Pressable>}</View>
            <Pressable style={styles.photoPicker} onPress={choosePhoto}>
              {photo ? <Image source={{ uri: photo }} style={styles.photoPreview} /> : <View style={styles.photoPlaceholder}><Feather name="camera" size={22} color="#315c55" /></View>}
              <View><Text style={styles.photoTitle}>{photo ? 'Change profile picture' : 'Add profile picture'}</Text><Text style={styles.photoHint}>Optional · stored in Cloud Storage</Text></View>
            </Pressable>
            <View style={styles.field}><Text style={styles.label}>FULL NAME</Text><TextInput value={form.name} onChangeText={(value) => updateField('name', value)} placeholder="e.g. Jordan Lee" placeholderTextColor="#9ba5a1" style={styles.input} /></View>
            <View style={styles.field}><Text style={styles.label}>COURSE / PROGRAM</Text><TextInput value={form.course} onChangeText={(value) => updateField('course', value)} placeholder="e.g. Computer Science" placeholderTextColor="#9ba5a1" style={styles.input} /></View>
            <View style={styles.splitFields}><View style={styles.halfField}><Text style={styles.label}>YEAR LEVEL</Text><TextInput value={form.yearLevel} onChangeText={(value) => updateField('yearLevel', value)} placeholder="e.g. 2" placeholderTextColor="#9ba5a1" keyboardType="number-pad" style={styles.input} /></View><View style={styles.halfField}><Text style={styles.label}>AGE</Text><TextInput value={form.age} onChangeText={(value) => updateField('age', value)} placeholder="e.g. 20" placeholderTextColor="#9ba5a1" keyboardType="number-pad" style={styles.input} /></View></View>
            <View style={styles.field}><Text style={styles.label}>EMAIL</Text><TextInput value={form.email} onChangeText={(value) => updateField('email', value)} placeholder="student@example.com" placeholderTextColor="#9ba5a1" keyboardType="email-address" autoCapitalize="none" style={styles.input} /></View>
            <Pressable style={({ pressed }) => [styles.saveButton, pressed && styles.pressed, loading && styles.disabled]} onPress={saveStudent} disabled={loading}>{loading ? <ActivityIndicator color="#f7f8f4" /> : <><Feather name={editingId ? 'check' : 'plus'} size={18} color="#f7f8f4" /><Text style={styles.saveButtonText}>{editingId ? 'Update record' : 'Save record'}</Text></>}</Pressable>
          </View>

          <View style={styles.listHeader}><Text style={styles.sectionTitle}>Directory</Text><Text style={styles.count}>{students.length} {students.length === 1 ? 'student' : 'students'}</Text></View>
          {reading ? <ActivityIndicator color="#315c55" style={styles.loader} /> : <FlatList data={students} keyExtractor={(item) => item.id} renderItem={renderStudent} scrollEnabled={false} ListEmptyComponent={<Text style={styles.empty}>No records yet. Add the first student above.</Text>} />}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f7f8f4' },
  screen: { flex: 1 },
  content: { padding: 24, paddingBottom: 48 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  eyebrow: { color: '#6c827a', fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },
  title: { color: '#173b35', fontSize: 31, fontWeight: '800', marginTop: 5 },
  subtitle: { color: '#66736f', fontSize: 15, marginTop: 8, marginBottom: 22 },
  headerMark: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#315c55', alignItems: 'center', justifyContent: 'center' },
  setupNotice: { flexDirection: 'row', backgroundColor: '#fff2d5', padding: 12, borderRadius: 10, gap: 9, marginBottom: 14 },
  setupText: { color: '#6d511e', flex: 1, fontSize: 13, lineHeight: 18 },
  message: { padding: 12, borderRadius: 10, marginBottom: 14 },
  errorMessage: { backgroundColor: '#fbe5e1' },
  successMessage: { backgroundColor: '#dcefe5' },
  messageText: { color: '#36504a', fontSize: 13 },
  formCard: { backgroundColor: '#fff', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: '#e5e9e4' },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionTitle: { color: '#173b35', fontSize: 19, fontWeight: '800' },
  cancelText: { color: '#b34e45', fontWeight: '700', fontSize: 13 },
  photoPicker: { flexDirection: 'row', alignItems: 'center', marginBottom: 18, gap: 12 },
  photoPlaceholder: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#e4f0ea', alignItems: 'center', justifyContent: 'center' },
  photoPreview: { width: 54, height: 54, borderRadius: 27 },
  photoTitle: { color: '#315c55', fontSize: 14, fontWeight: '700' },
  photoHint: { color: '#8a9691', fontSize: 12, marginTop: 3 },
  field: { marginBottom: 14 },
  splitFields: { flexDirection: 'row', gap: 12 },
  halfField: { flex: 1 },
  label: { color: '#71807a', fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 7 },
  input: { backgroundColor: '#f7f8f4', borderWidth: 1, borderColor: '#e2e8e3', borderRadius: 9, height: 47, paddingHorizontal: 13, color: '#203f39', fontSize: 15 },
  saveButton: { backgroundColor: '#315c55', height: 49, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, marginTop: 3 },
  saveButtonText: { color: '#f7f8f4', fontWeight: '800', fontSize: 15 },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.6 },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 28, marginBottom: 12 },
  count: { color: '#8a9691', fontSize: 13 },
  loader: { marginTop: 24 },
  empty: { color: '#8a9691', textAlign: 'center', padding: 24, fontSize: 14 },
  studentRow: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e9e4', borderRadius: 13, padding: 12, flexDirection: 'row', alignItems: 'center', marginBottom: 9 },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  avatarFallback: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#d9ebe3', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#315c55', fontSize: 19, fontWeight: '800' },
  studentInfo: { flex: 1, marginLeft: 12 },
  studentName: { color: '#173b35', fontSize: 15, fontWeight: '800' },
  studentMeta: { color: '#6d7b76', fontSize: 12, marginTop: 3 },
  studentEmail: { color: '#8a9691', fontSize: 11, marginTop: 3 },
  rowActions: { flexDirection: 'row', gap: 3, marginLeft: 5 },
  iconButton: { padding: 8 },
});