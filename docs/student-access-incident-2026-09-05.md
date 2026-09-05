# Ines/Urszula lesson access, 5 September 2026

Both 2 September lesson records, taught vocabulary and annotated PDFs existed and
loaded over public HTTPS. Ines had 13 keyword rows and six PDF pages; Urszula had
20 keyword rows and three PDF pages. This does not prove what a student's existing
browser tab displays. Ines reported the previous lesson missing inside the app.

The 2 September completed-status/date classifier fix remains in production. A
separate defect in useStudentData loaded the archive only when the student slug
changed: moving between Lessons and Dashboard, or returning to an open tab days
later, never fetched newly published lessons. The PDF registry was also loaded
only once per Lessons mount. This is a supported failure mechanism, not proof of
the exact state of Ines's device.

The app now refreshes on navigation, return to a visible tab, every minute while
visible, and the Refresh lessons button. A temporary failed read retains the last
successful materials. The notes registry revalidates with the lesson data.

Superadmin Students now offers Open student app, which renders the actual App
components with a server-issued student-scoped session. Sessions expire after
15 minutes (or the issuing admin's session expiry), remain in tab sessionStorage,
and have explicit start/end audit entries. Closing the view revokes the session.
No student password or ordinary login is changed. Practice inspection does not
record progress/exposures or modify saved practice sessions; checkout goes through
the admin billing controls. Other intentional account actions affect the student.

Mike's live superadmin Google account is mmponcana@gmail.com. The legacy password
account michael@conversa.com is org_admin, so it is not the correct all-school
account. Use /login with Google, then /admin/superadmin/school/students.

Separate unresolved notification defect: Ines's 2 September publisher ledger says
studentEmailed=true but records a TEST-mode destination of Mike. This is not learner
delivery. No notification or reply was sent during this investigation. Do not use
that ledger flag as evidence of receipt, and do not force-run the whole publisher
to resend one message.

Verification must include the live signed-in student app and a working Raw notes
link. The publisher's standalone 20-check script checks public artifacts but never
mounts the student UI. Its last check also refreshes Bajla, despite its read-only
description. A passing result alone cannot close a student access complaint.
