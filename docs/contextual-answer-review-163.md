# Contextual fourth-choice review (#163)

`content/contextual/answer-amendments.json` adds one distractor to each of the 46 three-choice questions. The other 34 questions already have four choices. It preserves every source sentence, question, correct answer and original option, and advances only amended question revisions from 1 to 2.

| Question group | Added answer | Questions | Rationale |
| --- | --- | ---: | --- |
| Water/coffee/draft beer | お茶 — おちゃ — tea | 8 | Another familiar beverage; every affected sentence explicitly names water or coffee as the answer. The owner selected a new tea picture for this option. |
| Teacher/student/father | 母 — はは — my mother | 8 | Familiar person/family role; the stated actor is the teacher. |
| Running/walking/swimming | 休んでいます — やすんでいます — is resting | 2 | Another ongoing action, matching the existing verb form; the teacher is explicitly running. |
| Size, correct answer 大きい | とても小さい — とてもちいさい — very small | 4 | Opposite intensified size, never an intensified synonym of the correct answer. |
| Size, correct answer 小さい | とても大きい — とてもおおきい — very large | 4 | Opposite intensified size, never an intensified synonym of the correct answer. |
| Red/white/blue | 水色 — みずいろ — sky blue | 4 | Reuses a distinct approved paint-swatch picture. Every correct answer in this group is red or white. |
| Book/notebook/magazine | 新聞 — しんぶん — newspaper | 2 | Another beginner-friendly reading object; the sentence explicitly names a book. |
| Morning/daytime/night | 夕方 — ゆうがた — early evening | 4 | Another time of day; the stated answer is morning. |
| Teacher/doctor/company employee | 学生 — がくせい — student | 2 | Familiar work/status answer; Tanaka is explicitly a teacher. |
| Tanaka/Sato/Yamada | 鈴木さん — すずきさん — Mr./Ms. Suzuki | 2 | Another common surname; the sentence identifies Tanaka as the teacher. |
| Seven/eight/six o'clock | 九時 — くじ — nine o'clock | 2 | Another clock time; the teacher explicitly arrives at seven. |
| Running/walking/by car | バスで行きます — バスでいきます — goes by bus | 2 | Another way to travel with the same polite answer form; the older brother explicitly runs. |
| Older brother/younger sister/mother | 弟 — おとうと — my younger brother | 2 | Another family role, distinct from the stated older brother. |

The size additions overlap an existing *wrong* distractor (small/very small or large/very large). This retains a size answer while avoiding another defensible correct option. Similarly, sky blue belongs to the broad blue family, but blue is always wrong in the affected questions. These are explicit pilot tradeoffs, not extra correct answers.

Sky blue uses the existing approved paint-swatch picture `ja-v-d42b5be1c4ad`. Tea references the new contextual-only vocabulary record `ja-contextual-tea`; the coordinator prepares and validates its picture. Sentence and question audio remains unchanged.

Amendment-local supporting-vocabulary IDs avoid conflicts between the three source banks. Existing `sup-small`, `sup-large`, `sup-student`, `sup-bus` and `sup-go` are reused only where each source bank already defines them. Grammar stays within the existing adjective, progressive and polite transport tags.

Content audit: all 46 deficient questions covered exactly once; all 80 resulting questions have four options; normalized text, readings and meanings are distinct; grammar/support references resolve; correct answers and original options are unchanged. Existing colour-picture sources and hashes are distinct within each question. The new tea record, picture integrity and final runtime application remain coordinator checks.

## Review and provenance

The three original `ja-*.json` banks remain the speech-approved generation snapshots. Current practice and `?review=contextual` apply the answer amendments after checking the accepted sentence/question recordings against those snapshots. Only the 46 changed question revisions advance to 2; their existing correct IDs and original choices stay intact. Current preflight (`npm run content:contextual:validate`) validates all 80 effective questions, including picture and supporting-word references. Audio generation tools keep their original approved inputs.

Tea is answer-only vocabulary and adds no scheduled word card. The [new transparent tea illustration](../public/images/contextual/tea-a3de617c4246.png) is prepared for owner review. Its [exact built-in generation/edit prompts and delivery hash](../artifacts/contextual-answers-163/image-generation.json) and both source variants are preserved. No speech was generated.
