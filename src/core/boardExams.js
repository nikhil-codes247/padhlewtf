/**
 * boardExams.js — Board Exam Countdown & Date Sheet data layer.
 *
 * The CBSE date-sheet data (exam_schedule.json + exam_information.json from
 * the sibling examdatesheetinfo folder) is embedded statically so it works in
 * the browser with no file-system access. Every exam is mapped to the app's
 * stable subject ids so it integrates with subject selection, planner and
 * dashboard. Nothing here touches the DOM — views render from this data.
 *
 * Subject-key → app subject id mapping:
 *   mathematics_standard → sub-math   | mathematics_basic → sub-mathb
 *   science              → sub-sci    | social_science    → sub-sst
 *   english_...          → sub-eng    | hindi_course_a    → sub-hin-a
 *   hindi_course_b       → sub-hin    | sanskrit (122)    → sub-sskrit
 *   computer_applications → sub-comp  | information_technology → sub-it
 *   artificial_intelligence → sub-ai
 */

import { diffDays, todayISO } from "./dates.js?v=mwz8yitl";

export const EXAM_SCHEDULE_DATA = {
  "schema_version": "1.0",
  "metadata": {
    "board": "CBSE",
    "class_level": 10,
    "examination_name": "Secondary School Examination",
    "examination_year": 2027,
    "source_document_reference": "CBSE/Date Sheet/X-XII/2026-27",
    "source_document_date": "2026-11-06",
    "timezone": "Asia/Kolkata",
    "first_exam_date_overall": "2027-02-16",
    "first_exam_date_in_app_subjects": "2027-02-17",
    "last_exam_date_in_app_subjects": "2027-03-08",
    "total_records": 12,
    "date_format": "YYYY-MM-DD",
    "time_format": "HH:MM (24-hour)"
  },
  "exams": [
    {
      "exam_id": "cbse10-2027-041",
      "subject_key": "mathematics_standard",
      "subject_name": "Mathematics Standard",
      "subject_group": "mathematics",
      "subject_code": "041",
      "exam_type": "theory",
      "exam_date": "2027-02-17",
      "day_of_week": "Wednesday",
      "start_time": "10:30",
      "end_time": "13:30",
      "duration_minutes": 180,
      "reading_time_minutes": null,
      "additional_time_minutes": null,
      "subject_specific_instructions": [],
      "same_day_subject_codes": ["241"],
      "flags": []
    },
    {
      "exam_id": "cbse10-2027-241",
      "subject_key": "mathematics_basic",
      "subject_name": "Mathematics Basic",
      "subject_group": "mathematics",
      "subject_code": "241",
      "exam_type": "theory",
      "exam_date": "2027-02-17",
      "day_of_week": "Wednesday",
      "start_time": "10:30",
      "end_time": "13:30",
      "duration_minutes": 180,
      "reading_time_minutes": null,
      "additional_time_minutes": null,
      "subject_specific_instructions": [],
      "same_day_subject_codes": ["041"],
      "flags": []
    },
    {
      "exam_id": "cbse10-2027-086",
      "subject_key": "science",
      "subject_name": "Science",
      "subject_group": "science",
      "subject_code": "086",
      "exam_type": "theory",
      "exam_date": "2027-02-22",
      "day_of_week": "Monday",
      "start_time": "10:30",
      "end_time": "13:30",
      "duration_minutes": 180,
      "reading_time_minutes": null,
      "additional_time_minutes": null,
      "subject_specific_instructions": [],
      "same_day_subject_codes": [],
      "flags": []
    },
    {
      "exam_id": "cbse10-2027-165",
      "subject_key": "computer_applications",
      "subject_name": "Computer Applications",
      "subject_group": "computer_applications",
      "subject_code": "165",
      "exam_type": "theory",
      "exam_date": "2027-02-24",
      "day_of_week": "Wednesday",
      "start_time": "10:30",
      "end_time": "12:30",
      "duration_minutes": 120,
      "reading_time_minutes": null,
      "additional_time_minutes": null,
      "subject_specific_instructions": [],
      "same_day_subject_codes": ["402", "417"],
      "flags": []
    },
    {
      "exam_id": "cbse10-2027-402",
      "subject_key": "information_technology",
      "subject_name": "Information Technology",
      "subject_group": "information_technology",
      "subject_code": "402",
      "exam_type": "theory",
      "exam_date": "2027-02-24",
      "day_of_week": "Wednesday",
      "start_time": "10:30",
      "end_time": "12:30",
      "duration_minutes": 120,
      "reading_time_minutes": null,
      "additional_time_minutes": null,
      "subject_specific_instructions": [],
      "same_day_subject_codes": ["165", "417"],
      "flags": []
    },
    {
      "exam_id": "cbse10-2027-417",
      "subject_key": "artificial_intelligence",
      "subject_name": "Artificial Intelligence",
      "subject_group": "artificial_intelligence",
      "subject_code": "417",
      "exam_type": "theory",
      "exam_date": "2027-02-24",
      "day_of_week": "Wednesday",
      "start_time": "10:30",
      "end_time": "12:30",
      "duration_minutes": 120,
      "reading_time_minutes": null,
      "additional_time_minutes": null,
      "subject_specific_instructions": [],
      "same_day_subject_codes": ["165", "402"],
      "flags": []
    },
    {
      "exam_id": "cbse10-2027-184",
      "subject_key": "english_language_and_literature",
      "subject_name": "English (Language and Literature)",
      "subject_group": "english",
      "subject_code": "184",
      "exam_type": "theory",
      "exam_date": "2027-02-26",
      "day_of_week": "Friday",
      "start_time": "10:30",
      "end_time": "13:30",
      "duration_minutes": 180,
      "reading_time_minutes": null,
      "additional_time_minutes": null,
      "subject_specific_instructions": [],
      "same_day_subject_codes": ["101"],
      "flags": [
        "Same day as 101 English (Communicative), which is outside the app's supported subjects and is excluded."
      ]
    },
    {
      "exam_id": "cbse10-2027-119",
      "subject_key": "sanskrit_communicative",
      "subject_name": "Sanskrit (Communicative)",
      "subject_group": "sanskrit",
      "subject_code": "119",
      "exam_type": "theory",
      "exam_date": "2027-03-01",
      "day_of_week": "Monday",
      "start_time": "10:30",
      "end_time": "13:30",
      "duration_minutes": 180,
      "reading_time_minutes": null,
      "additional_time_minutes": null,
      "subject_specific_instructions": [],
      "same_day_subject_codes": ["122"],
      "flags": [
        "Date sheet lists two Sanskrit papers for Class X (119 and 122). Requirement says only 'Sanskrit'; both are included as separate records. Confirm which one(s) the app supports."
      ]
    },
    {
      "exam_id": "cbse10-2027-122",
      "subject_key": "sanskrit",
      "subject_name": "Sanskrit",
      "subject_group": "sanskrit",
      "subject_code": "122",
      "exam_type": "theory",
      "exam_date": "2027-03-01",
      "day_of_week": "Monday",
      "start_time": "10:30",
      "end_time": "13:30",
      "duration_minutes": 180,
      "reading_time_minutes": null,
      "additional_time_minutes": null,
      "subject_specific_instructions": [],
      "same_day_subject_codes": ["119"],
      "flags": [
        "Date sheet lists two Sanskrit papers for Class X (119 and 122). Requirement says only 'Sanskrit'; both are included as separate records. Confirm which one(s) the app supports."
      ]
    },
    {
      "exam_id": "cbse10-2027-002",
      "subject_key": "hindi_course_a",
      "subject_name": "Hindi Course-A",
      "subject_group": "hindi",
      "subject_code": "002",
      "exam_type": "theory",
      "exam_date": "2027-03-03",
      "day_of_week": "Wednesday",
      "start_time": "10:30",
      "end_time": "13:30",
      "duration_minutes": 180,
      "reading_time_minutes": null,
      "additional_time_minutes": null,
      "subject_specific_instructions": [],
      "same_day_subject_codes": ["085"],
      "flags": []
    },
    {
      "exam_id": "cbse10-2027-085",
      "subject_key": "hindi_course_b",
      "subject_name": "Hindi Course-B",
      "subject_group": "hindi",
      "subject_code": "085",
      "exam_type": "theory",
      "exam_date": "2027-03-03",
      "day_of_week": "Wednesday",
      "start_time": "10:30",
      "end_time": "13:30",
      "duration_minutes": 180,
      "reading_time_minutes": null,
      "additional_time_minutes": null,
      "subject_specific_instructions": [],
      "same_day_subject_codes": ["002"],
      "flags": []
    },
    {
      "exam_id": "cbse10-2027-087",
      "subject_key": "social_science",
      "subject_name": "Social Science",
      "subject_group": "social_science",
      "subject_code": "087",
      "exam_type": "theory",
      "exam_date": "2027-03-08",
      "day_of_week": "Monday",
      "start_time": "10:30",
      "end_time": "13:30",
      "duration_minutes": 180,
      "reading_time_minutes": null,
      "additional_time_minutes": null,
      "subject_specific_instructions": [],
      "same_day_subject_codes": [],
      "flags": []
    }
  ]
};

export const EXAM_INFO_DATA = {
  "schema_version": "1.0",
  "circular": {
    "circular_id": "CBSE/Date Sheet/X-XII/2026-27",
    "issue_date": "2026-11-06",
    "issued_by": "Dr Sanyam Bhardwaj",
    "issuer_designation": "Controller of Examinations",
    "issuing_organisation": "Central Board of Secondary Education (CBSE)",
    "issued_from": "Dwarka, New Delhi",
    "addressed_to": "The Principals/Heads of Schools, All Schools Affiliated to CBSE",
    "subject": "Date Sheet for Class X and Class XII Board Examinations, 2027",
    "official_website": "www.cbse.gov.in"
  },
  "examination_overview": {
    "examinations_commence_on": "2027-02-16",
    "commencement_day_of_week": "Tuesday",
    "common_start_time": "10:30",
    "common_start_time_timezone": "IST",
    "class_10_examination_name": "Secondary School Examination-2027",
    "class_10_number_of_subjects": 83,
    "class_12_number_of_subjects": 121,
    "date_sheet_released_days_before_commencement": 101,
    "class_10_last_exam_date": "2027-03-09",
    "date_sheet_basis": "Prepared from data submitted by schools in the List of Candidates (LOC); LOC submission is complete and the Board holds final subject-combination data.",
    "date_sheet_availability": "Available for access and download on www.cbse.gov.in."
  },
  "registration_statistics": {
    "class_10_registered_students_lakh_minimum": 26.5,
    "class_12_registered_students_lakh_minimum": 19.8,
    "wording": "Over 26.5 lakh Class X students and over 19.8 lakh Class XII students registered for the 2027 Board Examinations."
  },
  "general_instructions": [
    {
      "instruction_id": "gi-001",
      "category": "examination_timing",
      "text": "All examinations will commence at 10:30 a.m. (IST)."
    },
    {
      "instruction_id": "gi-002",
      "category": "official_instructions",
      "text": "Important Instructions will be issued separately."
    },
    {
      "instruction_id": "gi-003",
      "category": "admit_card",
      "text": "Read instructions given in Admit Card."
    },
    {
      "instruction_id": "gi-004",
      "category": "compliance",
      "text": "It is mandatory to comply with all instructions issued by the CBSE."
    },
    {
      "instruction_id": "gi-005",
      "category": "prohibited_items",
      "text": "No communication devices are allowed inside examination centre."
    }
  ],
  "date_sheet_preparation_factors": [
    {
      "factor_id": "pf-001",
      "text": "Adequate gaps have been provided between examinations of subjects commonly offered together by students in both Class X and Class XII."
    },
    {
      "factor_id": "pf-002",
      "text": "The tentative schedules of major entrance examinations for Class XII students have been taken into account. Every effort has been made to complete the Board Examinations well before the commencement of such entrance examinations, enabling students to manage their preparation effectively."
    },
    {
      "factor_id": "pf-003",
      "text": "The number of candidates appearing on a particular day at each examination centre has been considered to facilitate smooth conduct of examinations."
    },
    {
      "factor_id": "pf-004",
      "text": "The examination schedule has been designed to minimize the prolonged absence of teachers from their schools during the evaluation process."
    },
    {
      "factor_id": "pf-005",
      "text": "More than 40,000 subject combinations have been factored in while preparing the Date Sheets to ensure that examinations of any two subjects opted by a student do not coincide on the same date."
    }
  ],
  "announcements": [
    {
      "announcement_id": "an-001",
      "text": "The early release of the Date Sheets has been made possible due to the timely submission of LOCs by schools."
    },
    {
      "announcement_id": "an-002",
      "text": "Students will have sufficient time to plan and organize their examination preparation, thereby reducing examination-related anxiety and enhancing performance."
    },
    {
      "announcement_id": "an-003",
      "text": "Students, their families, and teachers will be able to plan their engagements and travel during the summer vacation period in accordance with the examination and evaluation schedules."
    },
    {
      "announcement_id": "an-004",
      "text": "Schools will be able to undertake academic planning and support measures for Board classes more effectively."
    },
    {
      "announcement_id": "an-005",
      "text": "Schools designated as examination centres will have adequate time to make the necessary arrangements and plan their institutional activities accordingly."
    }
  ],
  "information_not_in_source": {
    "reporting_time": null,
    "reading_time": null,
    "answer_sheet_guidelines": null,
    "permitted_items": null,
    "prohibited_items_detail": null,
    "practical_examination_dates": null,
    "practical_examination_instructions": null,
    "subject_specific_instructions": null,
    "note": "None of these are stated in the date sheet circular. Not inferred. CBSE states that important instructions will be issued separately and that the Admit Card carries further instructions."
  },
  "data_quality_flags": [
    {
      "flag_id": "dq-001",
      "severity": "low",
      "text": "Circular states the date sheet was released 101 days before commencement. Counting from the issue date 2026-11-06 to 2027-02-16 gives 102 days (101 counting from 2026-11-07). Value stored as printed."
    },
    {
      "flag_id": "dq-002",
      "severity": "medium",
      "text": "Two Sanskrit papers exist for Class X (119 Sanskrit (Communicative) and 122 Sanskrit), both on 2027-03-01. Both stored in exam_schedule.json; confirm app scope."
    },
    {
      "flag_id": "dq-003",
      "severity": "low",
      "text": "class_10_last_exam_date (2027-03-09) is the last Class X paper in the full date sheet across all subjects, not only the app's supported subjects. Last date among supported subjects is 2027-03-08."
    }
  ]
};

/** Map CBSE subject keys from the date sheet to the app's stable subject ids. */
const SUBJECT_KEY_TO_ID = {
  mathematics_standard: "sub-math",
  mathematics_basic: "sub-mathb",
  science: "sub-sci",
  social_science: "sub-sst",
  english_language_and_literature: "sub-eng",
  hindi_course_a: "sub-hin-a",
  hindi_course_b: "sub-hin",
  sanskrit: "sub-sskrit",
  computer_applications: "sub-comp",
  information_technology: "sub-it",
  artificial_intelligence: "sub-ai",
};

/** All exam records, each enriched with the app subject id and days-remaining. */
export function getExams() {
  const today = todayISO();
  return EXAM_SCHEDULE_DATA.exams.map((e) => {
    const subjectId = SUBJECT_KEY_TO_ID[e.subject_key] || null;
    const days = diffDays(today, e.exam_date);
    return {
      ...e,
      subjectId,
      daysUntil: days,
      isPast: days < 0,
      isToday: days === 0,
      isTomorrow: days === 1,
      isUpcoming: days > 0,
    };
  });
}

/** The next upcoming exam (by date), or null. */
export function getNextExam() {
  const exams = getExams().filter((e) => e.isUpcoming);
  if (!exams.length) return null;
  exams.sort((a, b) => a.exam_date.localeCompare(b.exam_date) || a.start_time.localeCompare(b.start_time));
  return exams[0];
}

/** Exams filtered by whether the subject is in the student's selection. */
export function getExamsForSelection(selectedSubjectIds) {
  const exams = getExams();
  if (!selectedSubjectIds || selectedSubjectIds.length === 0) return exams;
  const set = new Set(selectedSubjectIds);
  return exams.map((e) => ({
    ...e,
    inSelection: e.subjectId ? set.has(e.subjectId) : false,
  }));
}

/** The circular / notice metadata from exam_information.json. */
export function getCircular() {
  return EXAM_INFO_DATA.circular;
}

/** General instructions from the CBSE circular. */
export function getInstructions() {
  return EXAM_INFO_DATA.examination_overview;
}

/** Announcements from the circular. */
export function getAnnouncements() {
  return EXAM_INFO_DATA.announcements;
}


/** Registration statistics (lakhs). */
export function getStats() {
  return EXAM_INFO_DATA.registration_statistics;
}
