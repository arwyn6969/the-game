export function ArcadeMark({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path fill="currentColor" d="M14 3h4v4h4v4h4v4h4v4h-4v10H6V19H2v-4h4v-4h4V7h4V3Z" />
      <path fill="#10091c" d="M10 18h12v7h-4v-5h-4v5h-4v-7Z" />
      <path fill="#b48aff" d="M14 11h4v4h-4z" />
    </svg>
  );
}

export function PixelUniverse() {
  return (
    <svg className="pixel-universe" viewBox="0 0 480 240" fill="none" aria-hidden="true">
      <g fill="#b48aff">
        <path d="M43 34h4v4h-4zM66 134h3v3h-3zM405 64h4v4h-4zM370 182h3v3h-3zM290 18h3v3h-3zM156 20h3v3h-3zM430 156h3v3h-3zM25 190h3v3h-3z" />
        <path d="M90 52h4v4h4v4h-4v4h-4v-4h-4v-4h4zM380 25h4v4h4v4h-4v4h-4v-4h-4v-4h4z" />
      </g>
      <g fill="#c3ff63">
        <path d="M430 102h4v4h4v4h-4v4h-4v-4h-4v-4h4zM116 178h4v4h4v4h-4v4h-4v-4h-4v-4h4z" />
        <path d="M180 42h3v3h-3zM320 211h3v3h-3zM62 91h3v3h-3z" />
      </g>
      <path
        d="M144 75h16V59h32V43h96v16h32v16h16v96h-16v16h-32v16h-96v-16h-32v-16h-16V75Z"
        fill="#39205c"
      />
      <path d="M160 75h32V59h96v16h32v80h-16v16h-32v16h-80v-16h-16v-16h-16V75Z" fill="#684398" />
      <path d="M176 75h32V59h64v16h32v16h16v48h-32v-16h-32V91h-32v16h-48V75Z" fill="#8b5fc4" />
      <path d="M176 139h16v16h32v16h48v16h-80v-16h-16v-32Z" fill="#b48aff" />
      <path
        d="M142 145h-34v-8H84v-16h12v-8h28v-8h24M336 89h36v8h24v16h-12v8h-28v8h-26"
        stroke="#c3ff63"
        strokeWidth="4"
      />
      <path d="M148 137h24v-8h40v-8h52v-8h40v-8h28" stroke="#c3ff63" strokeWidth="4" />
      <path d="M205 92h10v-9h10v-9h10v-9h10v9h10v9h10v9h10v9h-70v-9Z" fill="#c3ff63" />
      <path d="M215 101h50v38h-50z" fill="#eee4ff" />
      <path d="M235 115h12v24h-12zM221 107h8v8h-8zM252 107h8v8h-8z" fill="#342044" />
      <path d="M205 139h70v5h-70z" fill="#10091c" />
      <path d="M306 41h8v-8h24v8h8v8h8v8h-56v-8h8v-8Z" fill="#dd86ee" />
      <path d="M310 41h32v8h-32z" fill="#b48aff" />
      <path d="M296 57h60v8h-60z" fill="#c3ff63" />
      <path d="M310 69h4v4h-4zM326 69h4v4h-4zM342 69h4v4h-4z" fill="#c3ff63" opacity=".5" />
    </svg>
  );
}
