"""
Unit tests for ClimateNLIClassifier (Enhanced Zero-Shot Classification).
Tests model loading, classification accuracy, false positive filtering,
Philippine geo-relevance, and batch processing.
"""

import pytest
import os
from backend.python.models.classifier import ClimateNLIClassifier


class TestClimateNLIClassifier:
    """Test suite for Enhanced Zero-Shot Classifier"""
    
    @pytest.fixture
    def classifier(self):
        """Create a classifier instance for testing"""
        return ClimateNLIClassifier(cache_dir='/tmp/test_cache')
    
    def test_classifier_initialization(self, classifier):
        """Test classifier initializes with correct parameters"""
        assert classifier.active_model is None  # Not loaded yet
        assert len(classifier.categories) == 10
        assert 'flooding' in classifier.categories
        assert 'typhoon' in classifier.categories
        assert len(classifier.fallback_models) >= 2
    
    def test_get_categories(self, classifier):
        """Test get_categories returns all hazard types"""
        categories = classifier.get_categories()
        assert len(categories) == 10
        assert 'flooding' in categories
        assert 'fire' in categories
        assert 'earthquake' in categories
        assert 'typhoon' in categories
        assert 'landslide' in categories
        assert 'volcanic eruption' in categories
        assert 'drought' in categories
        assert 'tsunami' in categories
        assert 'storm surge' in categories
        assert 'tornado' in categories
    
    def test_model_loading(self, classifier):
        """Test model loads successfully"""
        classifier.load_model()
        assert classifier.model is not None
        assert classifier.active_model is not None
    
    def test_classify_flooding_text(self, classifier):
        """Test classification of flooding-related text"""
        text = "Heavy rainfall caused severe flooding in Metro Manila today. " \
               "Streets are submerged and residents are being evacuated by rescue teams."
        
        result = classifier.classify(text, threshold=0.5)
        
        assert 'hazard_type' in result
        assert 'score' in result
        assert 'is_hazard' in result
        assert 'philippine_relevant' in result
        assert result['is_hazard'] is True
        assert result['hazard_type'] in classifier.categories
        assert result['score'] > 0.5
        assert result['philippine_relevant'] is True
    
    def test_classify_typhoon_text(self, classifier):
        """Test classification of typhoon-related text"""
        text = "Super Typhoon Yolanda made landfall in Tacloban City " \
               "with winds exceeding 300 km/h, causing widespread destruction. " \
               "NDRRMC reports thousands displaced."
        
        result = classifier.classify(text, threshold=0.5)
        
        assert result['is_hazard'] is True
        assert result['hazard_type'] == 'typhoon'
        assert result['score'] > 0.6
        assert result['philippine_relevant'] is True
    
    def test_classify_fire_text(self, classifier):
        """Test classification of fire-related text"""
        text = "A massive fire broke out in Quezon City today destroying hundreds of homes. " \
               "BFP firefighters are battling the blaze as residents evacuate."
        
        result = classifier.classify(text, threshold=0.5)
        
        assert result['is_hazard'] is True
        assert result['hazard_type'] == 'fire'
        assert result['score'] > 0.5
    
    def test_classify_earthquake_text(self, classifier):
        """Test classification of earthquake-related text"""
        text = "A magnitude 7.2 earthquake struck Mindanao this morning, " \
               "causing buildings to collapse. PHIVOLCS reports 5 dead."
        
        result = classifier.classify(text, threshold=0.5)
        
        assert result['is_hazard'] is True
        assert result['hazard_type'] == 'earthquake'
        assert result['score'] > 0.5
    
    def test_classify_empty_text(self, classifier):
        """Test classification with empty text"""
        result = classifier.classify("", threshold=0.5)
        
        assert result['hazard_type'] is None
        assert result['score'] == 0.0
        assert result['is_hazard'] is False
    
    def test_classify_returns_all_scores(self, classifier):
        """Test that classify returns scores for all categories"""
        text = "Flooding reported in several areas of Metro Manila after heavy rain today."
        
        result = classifier.classify(text, threshold=0.5)
        
        assert 'all_scores' in result
        assert len(result['all_scores']) == 10
        
        # All scores should sum to approximately 1.0 (softmax distribution)
        total_score = sum(result['all_scores'].values())
        assert 0.95 <= total_score <= 1.05
    
    # =========================================================================
    # FALSE POSITIVE FILTERING TESTS
    # =========================================================================
    
    def test_filter_infrastructure_project(self, classifier):
        """Test that flood control construction projects are filtered out"""
        text = "DPWH announces groundbreaking of P500M flood control project in Manila. " \
               "The infrastructure development includes drainage systems and pumping stations."
        
        result = classifier.classify(text, threshold=0.5)
        
        assert result['is_hazard'] is False
        assert result['exclusion_check']['excluded'] is True
        assert 'infrastructure' in result['exclusion_check']['reason'].lower() or \
               'project' in result['exclusion_check']['reason'].lower()
    
    def test_filter_road_widening_project(self, classifier):
        """Test that road widening projects are filtered out"""
        text = "The city government has begun the road widening project along Commonwealth Avenue. " \
               "Construction is expected to last 2 years."
        
        result = classifier.classify(text, threshold=0.5)
        
        assert result['is_hazard'] is False
        assert result['exclusion_check']['excluded'] is True
    
    def test_filter_planning_announcement(self, classifier):
        """Test that government planning announcements are filtered out"""
        text = "The mayor proposed a new flood mitigation program with a budget allocation " \
               "of P200 million for the upcoming fiscal year. Feasibility study ongoing."
        
        result = classifier.classify(text, threshold=0.5)
        
        assert result['is_hazard'] is False
        assert result['exclusion_check']['excluded'] is True
    
    def test_filter_disaster_drill(self, classifier):
        """Test that disaster preparedness drills are filtered out"""
        text = "Marikina City conducts earthquake and flood evacuation drill. " \
               "Residents participate in disaster preparedness exercise."
        
        result = classifier.classify(text, threshold=0.5)
        
        assert result['is_hazard'] is False
        assert result['exclusion_check']['excluded'] is True
    
    def test_filter_historical_reference(self, classifier):
        """Test that historical references to past disasters are filtered out"""
        text = "Remembering the victims of Typhoon Ondoy 15 years ago. " \
               "The 2009 disaster remains the deadliest flood in Metro Manila history."
        
        result = classifier.classify(text, threshold=0.5)
        
        assert result['is_hazard'] is False
        assert result['exclusion_check']['excluded'] is True
    
    def test_filter_research_study(self, classifier):
        """Test that research studies about hazards are filtered out"""
        text = "A new study by climate scientists reveals that flooding risk in Manila " \
               "will increase by 30% over the next decade due to climate change."
        
        result = classifier.classify(text, threshold=0.5)
        
        assert result['is_hazard'] is False
        assert result['exclusion_check']['excluded'] is True
    
    def test_filter_advisory_without_event(self, classifier):
        """Test that weather advisories without actual events are filtered"""
        text = "PAGASA advisory: Signal Number 1 raised over Batanes. " \
               "Classes suspended in affected areas. Preemptive evacuation ordered."
        
        result = classifier.classify(text, threshold=0.5)
        
        # Should be filtered as advisory without active hazard indicators
        assert result['exclusion_check']['excluded'] is True or result['is_hazard'] is False
    
    # =========================================================================
    # UNRELATED NEWS CATEGORY FILTERING TESTS
    # =========================================================================
    
    def test_filter_crime_news_murder(self, classifier):
        """Test that murder/crime news is filtered out"""
        text = "Cops probed over slay of Digos village chief. DIGOS CITY, Philippines — " \
               "The chief of police here and 21 intelligence officers will be subjected to " \
               "a paraffin test to find out whether they fired their service weapons on Tuesday night, " \
               "when the village chief of Tres de Mayo was shot and killed in his house."
        
        result = classifier.classify(text, threshold=0.5)
        
        assert result['is_hazard'] is False
        assert result['exclusion_check']['excluded'] is True
        assert 'crime' in result['exclusion_check']['reason'].lower()
    
    def test_filter_crime_news_police_investigation(self, classifier):
        """Test that police investigation news is filtered out"""
        text = "NBI arrests suspect in Quezon City robbery-homicide case. " \
               "The perpetrator was apprehended after forensic evidence linked him to the crime scene. " \
               "Warrant issued by Manila RTC."
        
        result = classifier.classify(text, threshold=0.5)
        
        assert result['is_hazard'] is False
        assert result['exclusion_check']['excluded'] is True
    
    def test_filter_crime_news_drug_bust(self, classifier):
        """Test that drug-related crime news is filtered out"""
        text = "PNP conducts drug bust in Manila, arrests 5 suspects. " \
               "Shabu worth P2 million seized in operation. Drug den raided."
        
        result = classifier.classify(text, threshold=0.5)
        
        assert result['is_hazard'] is False
        assert result['exclusion_check']['excluded'] is True
    
    def test_filter_politics_news(self, classifier):
        """Test that political news is filtered out"""
        text = "Senator files corruption charges against governor. " \
               "The Senate committee will hold hearings on the impeachment complaint. " \
               "Opposition party calls for resignation."
        
        result = classifier.classify(text, threshold=0.5)
        
        assert result['is_hazard'] is False
        assert result['exclusion_check']['excluded'] is True
    
    def test_filter_sports_news(self, classifier):
        """Test that sports news is filtered out"""
        text = "Gilas Pilipinas wins gold in SEA Games basketball finals. " \
               "The Philippine team defeated Indonesia in a thrilling championship match. " \
               "PBA players celebrate victory."
        
        result = classifier.classify(text, threshold=0.5)
        
        assert result['is_hazard'] is False
        assert result['exclusion_check']['excluded'] is True
    
    def test_filter_entertainment_news(self, classifier):
        """Test that entertainment news is filtered out"""
        text = "Actress wins Best Actress award at Manila Film Festival. " \
               "The teleserye star's performance in the drama movie earned critical acclaim. " \
               "Red carpet premiere held in Makati."
        
        result = classifier.classify(text, threshold=0.5)
        
        assert result['is_hazard'] is False
        assert result['exclusion_check']['excluded'] is True
    
    def test_filter_health_news(self, classifier):
        """Test that health news (non-environmental) is filtered out"""
        text = "DOH reports increase in dengue cases in Metro Manila. " \
               "Hospitals prepare for surge in patients. Vaccination campaign launched."
        
        result = classifier.classify(text, threshold=0.5)
        
        assert result['is_hazard'] is False
        assert result['exclusion_check']['excluded'] is True
    
    def test_filter_no_hazard_keywords(self, classifier):
        """Test that text without hazard keywords is filtered"""
        text = "Mayor announces new city ordinance on business permits. " \
               "LGU to streamline application process for entrepreneurs in Cebu City."
        
        result = classifier.classify(text, threshold=0.5)
        
        assert result['is_hazard'] is False
        assert result['exclusion_check']['excluded'] is True
        assert 'no_hazard_keywords' in result['exclusion_check']['reason']
    
    def test_pass_actual_flood_event(self, classifier):
        """Test that actual flood events pass through filters"""
        text = "BREAKING: Severe flooding hits Marikina City as Marikina River overflows. " \
               "Hundreds of families evacuated as floodwaters reach rooftops. " \
               "NDRRMC deploys rescue teams. 3 dead, 15 missing."
        
        result = classifier.classify(text, threshold=0.5)
        
        assert result['is_hazard'] is True
        assert result['hazard_type'] == 'flooding'
        assert result['exclusion_check']['excluded'] is False
        assert result['philippine_relevant'] is True
        assert result['active_event_signals'] >= 2
    
    def test_pass_actual_fire_event(self, classifier):
        """Test that actual fire events pass through filters"""
        text = "Fire engulfs residential area in Tondo, Manila. BFP reports 500 families " \
               "displaced. Fire destroyed 200 houses, still raging as of press time."
        
        result = classifier.classify(text, threshold=0.5)
        
        assert result['is_hazard'] is True
        assert result['hazard_type'] == 'fire'
        assert result['exclusion_check']['excluded'] is False
    
    # =========================================================================
    # PHILIPPINE GEO-RELEVANCE TESTS
    # =========================================================================
    
    def test_philippine_relevance_with_location(self, classifier):
        """Test that Philippine locations are detected"""
        text = "Flooding reported in Quezon City and Marikina. Rescue operations ongoing."
        
        result = classifier.classify(text, threshold=0.5)
        
        assert result['philippine_relevant'] is True
        assert result['philippine_indicators'] >= 1
    
    def test_philippine_relevance_with_agencies(self, classifier):
        """Test that Philippine agencies indicate relevance"""
        text = "NDRRMC reports flooding in several areas. PAGASA warns of more rain."
        
        result = classifier.classify(text, threshold=0.5)
        
        assert result['philippine_relevant'] is True
    
    def test_no_philippine_location(self, classifier):
        """Test that foreign hazard events are penalized"""
        text = "Massive flooding in Bangladesh kills hundreds. " \
               "Rescue teams deployed across affected regions."
        
        result = classifier.classify(text, threshold=0.5)
        
        # Should not be classified as Philippine hazard
        assert result['philippine_relevant'] is False
        # Either excluded or marked as not hazard due to geo-relevance
        assert result['is_hazard'] is False
    
    def test_philippine_barangay_detection(self, classifier):
        """Test that barangay-level locations are detected"""
        text = "Flooding in Barangay Santo Niño, Marikina City. Residents evacuated."
        
        result = classifier.classify(text, threshold=0.5)
        
        assert result['philippine_relevant'] is True
    
    # =========================================================================
    # CONTEXT ANALYSIS TESTS
    # =========================================================================
    
    def test_context_casualty_detection(self, classifier):
        """Test that casualty mentions boost context signals"""
        text = "Landslide in Benguet kills 5 people. Rescue teams search for 10 missing."
        
        result = classifier.classify(text, threshold=0.5)
        
        assert result['is_hazard'] is True
        assert result['context']['has_casualties'] is True
    
    def test_context_damage_detection(self, classifier):
        """Test that damage reports boost context signals"""
        text = "Typhoon Odette destroys thousands of homes in Cebu. " \
               "Damage estimated at P10 billion."
        
        result = classifier.classify(text, threshold=0.5)
        
        assert result['is_hazard'] is True
        assert result['context']['has_damage'] is True
    
    def test_context_emergency_response(self, classifier):
        """Test that emergency response mentions are detected"""
        text = "Coast Guard and PNP rescue stranded residents in flooded Malabon."
        
        result = classifier.classify(text, threshold=0.5)
        
        assert result['context']['has_emergency_response'] is True
    
    # =========================================================================
    # BATCH PROCESSING TESTS
    # =========================================================================
    
    def test_classify_batch_empty_list(self, classifier):
        """Test batch classification with empty list"""
        results = classifier.classify_batch([])
        assert results == []
    
    def test_classify_batch_single_text(self, classifier):
        """Test batch classification with single text"""
        texts = ["Flooding in Metro Manila today. Residents evacuated by rescue teams."]
        results = classifier.classify_batch(texts, threshold=0.5)
        
        assert len(results) == 1
        assert 'hazard_type' in results[0]
        assert 'exclusion_check' in results[0]
    
    def test_classify_batch_mixed_content(self, classifier):
        """Test batch classification with mixed hazard and non-hazard content"""
        texts = [
            # Should be classified as hazard
            "Severe flooding hits Metro Manila today. Thousands evacuated.",
            "Fire destroys residential area in Quezon City. 5 injured.",
            # Should be filtered out
            "DPWH announces new flood control project in Manila.",
            "Earthquake drill conducted in Makati schools.",
        ]
        
        results = classifier.classify_batch(texts, threshold=0.5)
        
        assert len(results) == 4
        
        # First two should be hazards
        assert results[0]['is_hazard'] is True
        assert results[1]['is_hazard'] is True
        
        # Last two should be filtered
        assert results[2]['is_hazard'] is False
        assert results[3]['is_hazard'] is False
    
    # =========================================================================
    # ENHANCED RESULT FIELDS TESTS
    # =========================================================================
    
    def test_result_contains_enhanced_fields(self, classifier):
        """Test that result contains all enhanced fields"""
        text = "Flooding in Manila today. Rescue ongoing."
        result = classifier.classify(text, threshold=0.5)
        
        # Core fields
        assert 'hazard_type' in result
        assert 'score' in result
        assert 'is_hazard' in result
        assert 'all_scores' in result
        
        # Enhanced fields
        assert 'raw_score' in result
        assert 'exclusion_check' in result
        assert 'philippine_relevant' in result
        assert 'active_event_signals' in result
        assert 'context' in result
    
    def test_get_exclusion_patterns_summary(self, classifier):
        """Test that exclusion patterns summary is available"""
        summary = classifier.get_exclusion_patterns_summary()
        
        assert 'infrastructure_patterns' in summary
        assert 'planning_patterns' in summary
        assert 'advisory_patterns' in summary
        assert 'philippine_indicators' in summary
        assert summary['infrastructure_patterns'] > 0
    
    def test_model_caching(self, classifier):
        """Test that model is cached after first load"""
        classifier.load_model()
        model_ref1 = classifier.model
        
        classifier.load_model()
        model_ref2 = classifier.model
        
        assert model_ref1 is model_ref2


@pytest.mark.integration
class TestClassifierIntegration:
    """Integration tests requiring actual model downloads"""
    
    def test_full_pipeline_rss_simulation(self):
        """Simulate RSS article classification pipeline"""
        classifier = ClimateNLIClassifier()
        classifier.load_model()
        
        # Simulated RSS articles - mix of actual hazards and false positives
        articles = [
            # Should be classified as hazard
            {
                'title': 'Heavy floods hit Metro Manila',
                'description': 'Severe flooding reported across Marikina and Quezon City. Rescue teams deployed. 5 dead.'
            },
            {
                'title': 'Fire in residential area',
                'description': 'A large fire broke out in Tondo, Manila today, destroying multiple homes. BFP responding.'
            },
            # Should be filtered out
            {
                'title': 'DPWH flood control project',
                'description': 'The DPWH announced new flood control infrastructure development in Manila Bay.'
            },
            {
                'title': 'Disaster preparedness seminar',
                'description': 'LGU conducts earthquake and flood awareness training for residents.'
            }
        ]
        
        results = []
        for article in articles:
            text = f"{article['title']}. {article['description']}"
            result = classifier.classify(text, threshold=0.5)
            results.append(result)
        
        # First two should be hazards
        assert results[0]['is_hazard'] is True
        assert results[1]['is_hazard'] is True
        
        # Last two should be filtered
        assert results[2]['is_hazard'] is False
        assert results[3]['is_hazard'] is False
    
    def test_precision_over_common_false_positives(self):
        """Test precision by verifying common false positives are filtered"""
        classifier = ClimateNLIClassifier()
        classifier.load_model()
        
        false_positive_texts = [
            "Flood control project inaugurated in Pasig City",
            "Road widening causes traffic in EDSA",
            "DPWH builds new drainage system to prevent flooding",
            "Anniversary of Typhoon Yolanda commemorated in Tacloban",
            "Study shows flood risk increasing in Metro Manila",
            "Earthquake drill conducted in Makati CBD",
            "Mayor proposes flood mitigation program",
            "Tourism advisory for travelers to Palawan",
            # Crime/Police news (the Digos case)
            "Cops probed over slay of village chief shot in his house. Paraffin test ordered.",
            "NBI arrests suspect in robbery case. Criminal charges filed.",
            # Politics
            "Senator files corruption case against governor. Impeachment hearing set.",
            # Sports
            "Gilas wins SEA Games basketball gold. PBA players celebrate.",
            # Entertainment
            "Actress wins award at film festival. Teleserye premiere held.",
        ]
        
        filtered_count = 0
        for text in false_positive_texts:
            result = classifier.classify(text, threshold=0.5)
            if not result['is_hazard']:
                filtered_count += 1
        
        # At least 85% should be correctly filtered
        precision_rate = filtered_count / len(false_positive_texts)
        assert precision_rate >= 0.85, f"Only {precision_rate*100:.1f}% filtered, expected >= 85%"
    
    def test_recall_over_actual_hazards(self):
        """Test recall by verifying actual hazards are detected"""
        classifier = ClimateNLIClassifier()
        classifier.load_model()
        
        actual_hazard_texts = [
            # These should all pass - actual environmental hazards with proper context
            "BREAKING: Flooding hits Marikina as river overflows. 100 families evacuated. NDRRMC deployed rescue teams.",
            "Fire destroys 50 houses in Tondo, Manila. BFP firefighters battle the blaze. 200 displaced.",
            "Magnitude 6.5 earthquake strikes Davao City. Buildings damaged, 3 dead. PHIVOLCS monitoring aftershocks.",
            "Typhoon Karding batters Aurora with 180 km/h winds. Storm surge warning issued. Towns isolated.",
            "Landslide buries homes in Benguet after heavy rain. Rescue teams search for survivors.",
            "Mayon Volcano eruption spews lava flows. PHIVOLCS raises Alert Level 3. Evacuation ongoing.",
            "Flash floods inundate Cagayan de Oro streets. Water levels rising. Coast Guard rescuing stranded residents.",
            "Storm surge destroys coastal homes in Tacloban. NDRRMC reports 500 families displaced.",
        ]
        
        detected_count = 0
        for text in actual_hazard_texts:
            result = classifier.classify(text, threshold=0.5)
            if result['is_hazard']:
                detected_count += 1
            else:
                print(f"MISSED: {text[:50]}... Reason: {result.get('exclusion_check', {}).get('reason', 'unknown')}")
        
        # At least 75% (6/8) should be detected
        recall_rate = detected_count / len(actual_hazard_texts)
        assert recall_rate >= 0.75, f"Only {recall_rate*100:.1f}% detected, expected >= 75%"
    
    def test_crime_vs_hazard_disambiguation(self):
        """Test that crime news is filtered even when it contains location names"""
        classifier = ClimateNLIClassifier()
        classifier.load_model()
        
        # This was the actual case that triggered the issue
        crime_text = """
        Cops probed over slay of Digos village chief. DIGOS CITY, Philippines — 
        The chief of police here and 21 intelligence officers will be subjected to a 
        paraffin test to find out whether they fired their service weapons on Tuesday night, 
        when the village chief of Tres de Mayo was shot and killed in his house. 
        According to Police Maj. Catherine dela Rey, spokesperson
        """
        
        result = classifier.classify(crime_text, threshold=0.5)
        
        # Must NOT be classified as a hazard
        assert result['is_hazard'] is False, "Crime news incorrectly classified as hazard"
        assert result['exclusion_check']['excluded'] is True, "Should be excluded"
        assert 'crime' in result['exclusion_check']['reason'].lower(), f"Wrong reason: {result['exclusion_check']['reason']}"


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
