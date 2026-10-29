
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

export default function HomeScreen() {
  const router = useRouter();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text style={styles.brand}>BetterRecipe</Text>
        <Text style={styles.tagline}>
          Make something wonderful with what you have.
        </Text>
      </View>

      <View style={styles.hero}>
        <Text style={styles.eyebrow}>YOUR KITCHEN, REIMAGINED</Text>
        <Text style={styles.title}>
          Good food starts{'\n'}with what you have.
        </Text>
        <Text style={styles.description}>
          Discover ingredients, find recipes that suit your kitchen,
          and make better use of every meal.
        </Text>

        <Pressable
          style={styles.primaryButton}
          onPress={() => router.push('/scan')}
          accessibilityRole="button"
        >
          <Text style={styles.primaryButtonText}>Scan Ingredients  →</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>Explore BetterRecipe</Text>
      <Text style={styles.sectionDescription}>
        Choose where you want to start.
      </Text>

      <View style={styles.featureList}>
        <Pressable
          style={styles.featureCard}
          onPress={() => router.push('/inventory')}
          accessibilityRole="button"
        >
          <Text style={styles.featureIcon}>🥬</Text>
          <View style={styles.featureText}>
            <Text style={styles.featureTitle}>My Inventory</Text>
            <Text style={styles.featureDescription}>
              Keep track of ingredients you have.
            </Text>
          </View>
          <Text style={styles.arrow}>›</Text>
        </Pressable>

        <Pressable
          style={styles.featureCard}
          onPress={() => router.push('/recipes')}
          accessibilityRole="button"
        >
          <Text style={styles.featureIcon}>🍲</Text>
          <View style={styles.featureText}>
            <Text style={styles.featureTitle}>Discover Recipes</Text>
            <Text style={styles.featureDescription}>
              Find meals that match your ingredients.
            </Text>
          </View>
          <Text style={styles.arrow}>›</Text>
        </Pressable>

        <Pressable
          style={styles.featureCard}
          onPress={() => router.push('/food-usage')}
          accessibilityRole="button"
        >
          <Text style={styles.featureIcon}>♻️</Text>
          <View style={styles.featureText}>
            <Text style={styles.featureTitle}>Food Usage</Text>
            <Text style={styles.featureDescription}>
              See what you use and what goes to waste.
            </Text>
          </View>
          <Text style={styles.arrow}>›</Text>
        </Pressable>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerTitle}>Cook thoughtfully. Waste less.</Text>
        <Text style={styles.footerText}>
          A research prototype for smarter household food utilization.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F8F2',
  },
  content: {
    padding: 22,
    paddingTop: 28,
    paddingBottom: 36,
  },
  header: {
    marginBottom: 26,
  },
  brand: {
    color: '#235B43',
    fontSize: 27,
    fontWeight: '800',
    letterSpacing: -0.7,
  },
  tagline: {
    color: '#657267',
    fontSize: 14,
    marginTop: 5,
  },
  hero: {
    backgroundColor: '#235B43',
    borderRadius: 24,
    padding: 23,
    marginBottom: 30,
  },
  eyebrow: {
    color: '#C7E2C8',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 16,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 31,
    fontWeight: '800',
    lineHeight: 38,
    letterSpacing: -0.6,
  },
  description: {
    color: '#E0EDE3',
    fontSize: 14,
    lineHeight: 22,
    marginTop: 13,
    marginBottom: 22,
  },
  primaryButton: {
    backgroundColor: '#E1EBCB',
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#214A37',
    fontSize: 15,
    fontWeight: '700',
  },
  sectionTitle: {
    color: '#20372B',
    fontSize: 21,
    fontWeight: '800',
  },
  sectionDescription: {
    color: '#6C786E',
    fontSize: 13,
    marginTop: 5,
    marginBottom: 16,
  },
  featureList: {
    gap: 12,
  },
  featureCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 17,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E8EBE1',
  },
  featureIcon: {
    fontSize: 27,
    marginRight: 14,
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    color: '#25392D',
    fontSize: 15,
    fontWeight: '700',
  },
  featureDescription: {
    color: '#778178',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  arrow: {
    color: '#467657',
    fontSize: 27,
    marginLeft: 8,
  },
  footer: {
    marginTop: 26,
    paddingTop: 19,
    borderTopWidth: 1,
    borderTopColor: '#E1E6DC',
  },
  footerTitle: {
    color: '#365C43',
    fontSize: 14,
    fontWeight: '700',
  },
  footerText: {
    color: '#7A837B',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },
});
