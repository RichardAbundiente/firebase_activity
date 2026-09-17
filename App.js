import { useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, Text, View } from 'react-native';
import './global.css';

const schema = {
  Program: [
    { name: 'programName', type: 'String' },
    { name: 'id', type: 'UUID' },
    { name: '_metadata', type: 'Metadata' },
    { name: 'department', type: 'String' },
    { name: 'students', type: 'Array<Student>' },
    { name: 'programName_count', type: 'Int' },
    { name: 'department_count', type: 'Int' },
    { name: 'students_count', type: 'Int' },
    { name: 'programName_count_max', type: 'Int' },
    { name: 'department_count_max', type: 'Int' },
    { name: 'students_count_max', type: 'Int' },
    { name: '_id', type: 'String' },
  ],
  Student: [
    { name: 'fullName', type: 'String' },
    { name: 'id', type: 'UUID' },
    { name: 'profileImage', type: 'String' },
    { name: 'programId', type: 'UUID' },
    { name: 'program', type: 'Program' },
    { name: 'mediaAssets', type: 'Array<MediaAsset>' },
    { name: 'createdAt', type: 'Timestamp' },
    { name: 'bio', type: 'String' },
    { name: 'contactEmail', type: 'String' },
    { name: '_metadata', type: 'Metadata' },
    { name: 'fullName_count', type: 'Int' },
    { name: 'profileImage_count', type: 'Int' },
    { name: 'programId_count', type: 'Int' },
    { name: '_id', type: 'String' },
  ],
  MediaAsset: [
    { name: 'url', type: 'String' },
    { name: 'id', type: 'UUID' },
    { name: 'studentId', type: 'UUID' },
    { name: 'student', type: 'Student' },
    { name: 'uploadedAt', type: 'Timestamp' },
    { name: 'metadata', type: 'Metadata' },
    { name: 'uploadedAt_max', type: 'Timestamp' },
    { name: 'studentId_count', type: 'Int' },
    { name: 'uploadedAt_count', type: 'Int' },
    { name: 'url_count', type: 'Int' },
    { name: '_id', type: 'String' },
  ],
  UserSession: [
    { name: 'email', type: 'String' },
    { name: 'id', type: 'UUID' },
    { name: 'lastLogin', type: 'Timestamp' },
    { name: 'role', type: 'String' },
    { name: 'metadata', type: 'Metadata' },
    { name: 'lastLogin_max', type: 'Timestamp' },
    { name: 'role_count', type: 'Int' },
    { name: 'email_count', type: 'Int' },
    { name: 'lastLogin_count', type: 'Int' },
    { name: 'loginCount', type: 'Int' },
    { name: '_id', type: 'String' },
  ],
};

const accents = {
  Program: ['#32d6ae', '#1c7a6c'],
  Student: ['#f7b858', '#b86d00'],
  MediaAsset: ['#ff76a8', '#b22967'],
  UserSession: ['#56c4ff', '#0f69bf'],
};

function SchemaCard({ title, fields, accent, expanded, onToggle }) {
  const visibleFields = expanded ? fields : fields.slice(0, 4);

  return (
    <View
      style={{
        width: '32%',
        minWidth: 220,
        maxWidth: 340,
        backgroundColor: '#1c232d',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#2e3945',
        padding: 12,
        marginBottom: 20,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: '#f3f5f7' }}>{title}</Text>
        <View style={{ backgroundColor: accent[1], borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 }}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: '#fff' }}>{title}</Text>
        </View>
      </View>

      {visibleFields.map((field) => (
        <View
          key={`${title}-${field.name}`}
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottomWidth: 1,
            borderBottomColor: '#2d3946',
            paddingVertical: 9,
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#edf1f4' }}>{field.name}</Text>
          <Text style={{ fontSize: 12, color: '#a4b4c2', fontWeight: '700' }}>{field.type}</Text>
        </View>
      ))}

      {fields.length > 4 && (
        <Pressable onPress={onToggle} style={{ marginTop: 12 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: accent[0] }}>
            {expanded ? 'Hide fields' : 'View data →'}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

export default function App() {
  const [expanded, setExpanded] = useState({});

  const toggleCard = (name) => {
    setExpanded((current) => ({ ...current, [name]: !current[name] }));
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0f14' }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 36 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 1.5, color: '#8ba0b1' }}>
            SHOW ALL FIELDS
          </Text>
          <Pressable
            onPress={() => setExpanded((current) => ({ Program: true, Student: true, MediaAsset: true, UserSession: true }))}
            style={{
              backgroundColor: '#1d2733',
              borderColor: '#2f3d4b',
              borderWidth: 1,
              borderRadius: 999,
              paddingHorizontal: 10,
              paddingVertical: 7,
            }}
          >
            <Text style={{ color: '#f4f7fa', fontSize: 12, fontWeight: '600' }}>Show all fields</Text>
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          {Object.entries(schema).map(([title, fields]) => (
            <SchemaCard
              key={title}
              title={title}
              fields={fields}
              accent={accents[title] || ['#9ca3af', '#374151']}
              expanded={Boolean(expanded[title])}
              onToggle={() => toggleCard(title)}
            />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
