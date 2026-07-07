# Chrome Userscripts

ScriptCat 우선, Tampermonkey 호환을 목표로 하는 userscript 모음입니다.

## 구조

기본은 스크립트마다 파일 하나입니다.

스크립트가 단일 `.user.js`로 충분하면 `scripts/` 아래에 파일로 둡니다.

```text
.
├── scripts/
│   ├── script-a.user.js
│   └── script-b.user.js
├── README.md
└── LICENSE
```

스크립트별로 설정, 테스트, 문서, 빌드가 필요해지면 폴더로 나눕니다.

```text
.
├── scripts/
│   └── script-c/
│       ├── script-c.user.js
│       └── README.md
├── README.md
└── LICENSE
```

## 라이선스

[The Unlicense](./LICENSE). 자유롭게 사용, 수정, 배포해도 됩니다.
