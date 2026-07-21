INSERT INTO reference_groups (code, name, description, is_system) VALUES
  ('expert_type', 'Expert Types', 'Employment/source classifications for experts.', TRUE),
  ('education_level', 'Education Levels', 'Normalized highest completed education levels.', TRUE),
  ('tender_status', 'Tender Statuses', 'Tender extraction, matching, review, and archive states.', TRUE),
  ('tender_format', 'Tender Formats', 'Supported source-document formats.', TRUE),
  ('cv_generation_mode', 'CV Generation Modes', 'Available CV generation workflows and filters.', TRUE),
  ('translation_language', 'Translation Languages', 'Languages offered by CV translation actions.', TRUE),
  ('user_role', 'User Roles', 'Application access roles.', TRUE),
  ('user_status', 'User Statuses', 'User account lifecycle states.', TRUE),
  ('app_module', 'Application Modules', 'Modules that may be shown or hidden.', TRUE),
  ('page_size', 'Page Sizes', 'Available table pagination sizes.', TRUE),
  ('match_sort', 'Match Sort Options', 'Available match-result ordering modes.', TRUE),
  ('risk_level', 'Risk Levels', 'Normalized AI matching risk levels.', TRUE),
  ('submission_type', 'Submission Types', 'Tender submission methods configured by administrators.', FALSE)
ON CONFLICT (code) DO NOTHING;

INSERT INTO reference_values
  (group_code, code, label, sort_order, metadata)
VALUES
  ('expert_type', 'INTERNAL', 'Internal', 10, '{}'),
  ('expert_type', 'EXTERNAL', 'External', 20, '{}'),

  ('education_level', 'PHD', 'PhD', 10, '{"rank": 100,"aliases":["Ph.D.","Doctor of Philosophy"]}'),
  ('education_level', 'DOCTORATE', 'Doctorate', 20, '{"rank": 100,"aliases":["Doctoral Degree"]}'),
  ('education_level', 'MASTER_DEGREE', 'Master Degree', 30, '{"rank": 90,"aliases":["Master''s Degree","Masters Degree","Master"]}'),
  ('education_level', 'BACHELOR_DEGREE', 'Bachelor Degree', 40, '{"rank": 80,"aliases":["Bachelor''s Degree","Bachelors Degree","Bachelor"]}'),
  ('education_level', 'POSTGRADUATE_DIPLOMA', 'Postgraduate Diploma', 50, '{"rank": 70}'),
  ('education_level', 'HIGHER_NATIONAL_DIPLOMA', 'Higher National Diploma', 60, '{"rank": 60}'),
  ('education_level', 'ASSOCIATE_DEGREE', 'Associate Degree', 70, '{"rank": 50}'),
  ('education_level', 'DIPLOMA', 'Diploma', 80, '{"rank": 40,"aliases":["National Diploma"]}'),
  ('education_level', 'CERTIFICATE', 'Certificate', 90, '{"rank": 30}'),
  ('education_level', 'SECONDARY_EDUCATION', 'Secondary Education', 100, '{"rank": 20}'),

  ('tender_status', 'OPEN', 'OPEN', 10, '{}'),
  ('tender_status', 'NEW', 'New', 20, '{}'),
  ('tender_status', 'TENDER_EXTRACTION_PROCESSING', 'Tender Extraction Processing', 30, '{}'),
  ('tender_status', 'TENDER_EXTRACTION_COMPLETED', 'Tender Extraction Completed', 40, '{}'),
  ('tender_status', 'TENDER_EXTRACTION_FAILED', 'Tender Extraction Failed', 50, '{}'),
  ('tender_status', 'MATCHING_PROCESSING', 'Matching Processing', 60, '{}'),
  ('tender_status', 'MATCHING_COMPLETED', 'Matching Completed', 70, '{}'),
  ('tender_status', 'MATCHING_FAILED', 'Matching Failed', 80, '{}'),
  ('tender_status', 'MATCHING_PARTIAL', 'Matching Partial', 90, '{}'),
  ('tender_status', 'REVIEW', 'Review', 100, '{}'),
  ('tender_status', 'ARCHIVED', 'Archived', 110, '{}'),

  ('tender_format', 'PDF', 'PDF', 10, '{"mimeTypes":["application/pdf"]}'),
  ('tender_format', 'DOCX', 'DOCX', 20, '{"mimeTypes":["application/vnd.openxmlformats-officedocument.wordprocessingml.document"]}'),

  ('cv_generation_mode', 'ALL', 'All Documents (Filter)', 10, '{"filterOnly":true}'),
  ('cv_generation_mode', 'NORMAL', 'Normal CV', 20, '{}'),
  ('cv_generation_mode', 'ADAPT', 'Adapt CV', 30, '{}'),
  ('cv_generation_mode', 'RENDER', 'Render CV', 40, '{}'),

  ('translation_language', 'FRENCH', 'French', 10, '{"locale":"fr"}'),
  ('translation_language', 'SPANISH', 'Spanish', 20, '{"locale":"es"}'),
  ('translation_language', 'ARABIC', 'Arabic', 30, '{"locale":"ar"}'),
  ('translation_language', 'GERMAN', 'German', 40, '{"locale":"de"}'),

  ('user_role', 'ADMIN', 'Admin', 10, '{}'),
  ('user_role', 'STAFF', 'Staff', 20, '{}'),
  ('user_role', 'VIEW', 'View', 30, '{}'),

  ('user_status', 'ACTIVE', 'Active', 10, '{}'),
  ('user_status', 'INVITED', 'Invited', 20, '{}'),
  ('user_status', 'DISABLED', 'Disabled', 30, '{}'),

  ('app_module', 'EXPERTS', 'Experts', 10, '{"route":"/experts","description":"Manage your expert database"}'),
  ('app_module', 'TENDERS', 'Tenders', 20, '{"route":"/tenders","description":"Manage your tenders and requirements"}'),
  ('app_module', 'MATCHES', 'Matching Engine', 30, '{"route":"/matches","description":"Perform AI-based candidate matching against tenders"}'),
  ('app_module', 'GENERATED_CVS', 'Generate CV', 40, '{"route":"/generated-cvs","description":"Generate and automate CV formatting for matching"}'),

  ('page_size', '10', '10', 10, '{"value":10}'),
  ('page_size', '20', '20', 20, '{"value":20}'),
  ('page_size', '50', '50', 30, '{"value":50}'),

  ('match_sort', 'SCORE_DESC', 'Highest Score', 10, '{"field":"score","direction":"desc"}'),
  ('match_sort', 'SCORE_ASC', 'Lowest Score', 20, '{"field":"score","direction":"asc"}'),
  ('match_sort', 'NAME_ASC', 'Name (A-Z)', 30, '{"field":"name","direction":"asc"}'),

  ('risk_level', 'LOW', 'Low', 10, '{}'),
  ('risk_level', 'MEDIUM', 'Medium', 20, '{}'),
  ('risk_level', 'HIGH', 'High', 30, '{}')
ON CONFLICT (group_code, code) DO NOTHING;

INSERT INTO position_taxonomy
  (code, label, category_code, category_label, sort_order)
VALUES
  ('PROJECT_MANAGER', 'Project Manager', 'PROJECT_MANAGEMENT_LEADERSHIP', 'Project Management & Leadership', 10),
  ('PLANNING_ENGINEER_SCHEDULER', 'Planning Engineer / Scheduler', 'PROJECT_MANAGEMENT_LEADERSHIP', 'Project Management & Leadership', 20),
  ('CONTRACTS_MANAGER', 'Contracts Manager', 'PROJECT_MANAGEMENT_LEADERSHIP', 'Project Management & Leadership', 30),

  ('CIVIL_ENGINEER_ROADS_HIGHWAYS', 'Civil Engineer Roads & Highways', 'DESIGN_ENGINEERING_GENERAL_CIVIL', 'Design & Engineering — General Civil', 10),
  ('HIGHWAY_ENGINEER', 'Highway Engineer', 'DESIGN_ENGINEERING_GENERAL_CIVIL', 'Design & Engineering — General Civil', 20),
  ('PAVEMENT_ENGINEER', 'Pavement Engineer', 'DESIGN_ENGINEERING_GENERAL_CIVIL', 'Design & Engineering — General Civil', 30),
  ('TRAFFIC_ENGINEER', 'Traffic Engineer', 'DESIGN_ENGINEERING_GENERAL_CIVIL', 'Design & Engineering — General Civil', 40),

  ('HYDRAULIC_ENGINEER', 'Hydraulic Engineer', 'DESIGN_ENGINEERING_WATER_HYDRAULIC_STRUCTURES', 'Design & Engineering — Water & Hydraulic Structures', 10),
  ('HYDROLOGY_ENGINEER', 'Hydrology Engineer', 'DESIGN_ENGINEERING_WATER_HYDRAULIC_STRUCTURES', 'Design & Engineering — Water & Hydraulic Structures', 20),
  ('IRRIGATION_ENGINEER', 'Irrigation Engineer', 'DESIGN_ENGINEERING_WATER_HYDRAULIC_STRUCTURES', 'Design & Engineering — Water & Hydraulic Structures', 30),
  ('DAM_ENGINEER', 'Dam Engineer', 'DESIGN_ENGINEERING_WATER_HYDRAULIC_STRUCTURES', 'Design & Engineering — Water & Hydraulic Structures', 40),

  ('STRUCTURAL_ENGINEER', 'Structural Engineer', 'DESIGN_ENGINEERING_STRUCTURAL', 'Design & Engineering — Structural', 10),
  ('BRIDGE_ENGINEER', 'Bridge Engineer', 'DESIGN_ENGINEERING_STRUCTURAL', 'Design & Engineering — Structural', 20),
  ('GEOTECHNICAL_ENGINEER', 'Geotechnical Engineer', 'DESIGN_ENGINEERING_STRUCTURAL', 'Design & Engineering — Structural', 30),

  ('SITE_ENGINEER', 'Site Engineer', 'SITE_CONSTRUCTION_ROLES', 'Site & Construction Roles', 10),
  ('LAND_SURVEYOR', 'Land Surveyor', 'SITE_CONSTRUCTION_ROLES', 'Site & Construction Roles', 20),
  ('QUANTITY_SURVEYOR_QS', 'Quantity Surveyor (QS)', 'SITE_CONSTRUCTION_ROLES', 'Site & Construction Roles', 30),
  ('MATERIAL_ENGINEER', 'Material Engineer', 'SITE_CONSTRUCTION_ROLES', 'Site & Construction Roles', 40),

  ('QA_QC_ENGINEER', 'QA/QC Engineer', 'QUALITY_SAFETY_COMPLIANCE', 'Quality, Safety & Compliance', 10),
  ('QA_QC_INSPECTOR', 'QA/QC Inspector', 'QUALITY_SAFETY_COMPLIANCE', 'Quality, Safety & Compliance', 20),
  ('HSE_ENGINEER', 'HSE Engineer', 'QUALITY_SAFETY_COMPLIANCE', 'Quality, Safety & Compliance', 30),

  ('CAD_TECHNICIAN_DRAFTSMAN', 'CAD Technician / Draftsman', 'TECHNICAL_SUPPORT', 'Technical Support', 10),
  ('DOCUMENT_CONTROLLER', 'Document Controller', 'ADMINISTRATIVE_SUPPORT', 'Administrative & Support', 10)
ON CONFLICT (code) DO NOTHING;
